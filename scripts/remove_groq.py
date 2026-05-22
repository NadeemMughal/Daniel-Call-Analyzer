# -*- coding: utf-8 -*-
"""Replace all Groq API calls with Anthropic Claude across n8n workflows."""
import json, re, os

BASE = r'c:\Users\User\Desktop\Daniel-Call-Analyzer\n8n\workflows'

CRED = {"httpHeaderAuth": {"id": "anthropic-header-auth", "name": "Anthropic Header Auth"}}
ANTHROPIC_HEADERS = {"parameters": [
    {"name": "anthropic-version", "value": "2023-06-01"},
    {"name": "content-type", "value": "application/json"}
]}

MODEL_MAP = {
    "'llama-3.1-8b-instant'": "'claude-haiku-4-5-20251001'",
    "'llama-3.3-70b-versatile'": "'claude-sonnet-4-6'",
    '"llama-3.1-8b-instant"': '"claude-haiku-4-5-20251001"',
    '"llama-3.3-70b-versatile"': '"claude-sonnet-4-6"',
}

def swap_models(s):
    for old, new in MODEL_MAP.items():
        s = s.replace(old, new)
    return s

def convert_system_in_body(body):
    """
    Transform:
      messages: [ { role: 'system', content: 'SYS' }, { role: 'user', content: ...
    To:
      system: 'SYS', messages: [ { role: 'user', content: ...
    """
    start = "messages: [ { role: 'system', content: '"
    sep   = "' }, { role: 'user',"
    si = body.find(start)
    if si == -1:
        return body
    content_start = si + len(start)
    ei = body.find(sep, content_start)
    if ei == -1:
        return body
    sys_content = body[content_start:ei]
    old = start + sys_content + sep
    new = "system: '" + sys_content + "', messages: [ { role: 'user',"
    return body.replace(old, new, 1)

def fix_http_node(node):
    """Convert a Groq httpRequest node to Anthropic."""
    params = node['parameters']
    params['url'] = 'https://api.anthropic.com/v1/messages'
    params['authentication'] = 'genericCredentialType'
    params['genericAuthType'] = 'httpHeaderAuth'
    node['credentials'] = dict(CRED)
    params['sendHeaders'] = True
    params['headerParameters'] = {k: [dict(h) for h in v] if isinstance(v, list) else v
                                   for k, v in ANTHROPIC_HEADERS.items()}

    # params.jsonBody / params.rawBody (specifyBody: json format)
    for key in ('jsonBody', 'rawBody'):
        if key not in params:
            continue
        val = params[key]
        val = swap_models(val)
        val = val.replace('groq_request_body', 'anthropic_request_body')
        if key == 'jsonBody':
            val = convert_system_in_body(val)
        params[key] = val

    # params.body.rawBody (contentType: json + body.mode: raw format)
    body = params.get('body', {})
    if isinstance(body, dict) and 'rawBody' in body:
        val = body['rawBody']
        val = swap_models(val)
        val = val.replace('groq_request_body', 'anthropic_request_body')
        body['rawBody'] = val
        params['body'] = body

    return node

PARSE_FIXES = [
    # Standard pattern in master-pipeline parse nodes
    ("const choices = firstJson.choices;\nlet responseText = String((choices && choices[0] && choices[0].message && choices[0].message.content) || '');",
     "let responseText = String((firstJson.content && firstJson.content[0] && firstJson.content[0].text) || '');"),
    # 06-meeting-summary Parse Summary
    ("$input.first().json.choices?.[0]?.message?.content",
     "$input.first().json.content?.[0]?.text"),
    # 07-trend-analysis Parse Trend Response
    ("groqResponse.choices?.[0]?.message?.content",
     "groqResponse.content?.[0]?.text"),
    # 05-notify Extract HTML Body
    ("groqResponse.choices && groqResponse.choices[0] && groqResponse.choices[0].message\n  ? groqResponse.choices[0].message.content",
     "groqResponse.content && groqResponse.content[0]\n  ? groqResponse.content[0].text"),
    # node name reference
    ("$('Build Groq Request')", "$('Build Anthropic Request')"),
    # llm_model label
    ("llm_model: 'llama-3.3-70b-versatile'", "llm_model: 'claude-sonnet-4-6'"),
    ("llm_model: 'llama-3.1-8b-instant'", "llm_model: 'claude-haiku-4-5-20251001'"),
]

CODE_BUILD_GROQ_FIX = (
    # Pattern in Build Groq Request / Build Trend Prompt code nodes
    "groq_request_body: {",
    "anthropic_request_body: {"
)

def fix_build_code_node(jsCode):
    """
    Fix Code nodes that build the Groq request body:
    1. Rename groq_request_body -> anthropic_request_body
    2. Swap model names
    3. Convert system message to Anthropic format
    """
    jsCode = jsCode.replace('groq_request_body', 'anthropic_request_body')
    jsCode = swap_models(jsCode)

    # Convert: messages: [\n        { role: 'system', content: systemPrompt },\n        { role: 'user', content: userPrompt }\n      ]
    # To: system: systemPrompt,\n        messages: [\n        { role: 'user', content: userPrompt }\n      ]
    # Use regex with flexible whitespace
    jsCode = re.sub(
        r"messages:\s*\[\s*\{\s*role:\s*'system',\s*content:\s*(\w+)\s*\},\s*\{\s*role:\s*'user',\s*content:\s*(\w+)\s*\}\s*\]",
        r"system: \1,\n        messages: [\n        { role: 'user', content: \2 }\n      ]",
        jsCode
    )
    return jsCode

def process_node(node):
    params = node.get('parameters', {})

    # Fix Groq HTTP Request nodes
    if (node.get('type') == 'n8n-nodes-base.httpRequest'
            and 'api.groq.com' in params.get('url', '')):
        node = fix_http_node(node)
        # Rename node
        node['name'] = (node['name']
            .replace('Groq', 'Claude')
            .replace('groq', 'Claude'))

    # Fix Code nodes
    if node.get('type') == 'n8n-nodes-base.code' and 'jsCode' in params:
        code = params['jsCode']
        # Apply response parsing fixes
        for old, new in PARSE_FIXES:
            code = code.replace(old, new)
        # Fix build nodes
        if 'groq_request_body' in code or 'anthropic_request_body' in code:
            code = fix_build_code_node(code)
        # Rename node if it's a build node
        if 'Build Groq Request' in node.get('name', ''):
            node['name'] = 'Build Anthropic Request'
        params['jsCode'] = code

    return node

NODE_RENAMES = {
    'Classify with Groq': 'Classify with Claude',
    'Score with Groq': 'Score with Claude',
    'Build Groq Request': 'Build Anthropic Request',
    'Format Email with Groq': 'Format Email with Claude',
    'Call Groq': 'Call Claude',
    'Generate Meeting Summary (Groq)': 'Generate Meeting Summary (Claude)',
}

def fix_connections(connections):
    """Rename Groq node keys and references inside the connections dict."""
    new_conn = {}
    for key, val in connections.items():
        new_key = NODE_RENAMES.get(key, key)
        # Fix "node" references inside each connection entry
        new_val = {}
        for direction, port_list in val.items():
            new_port_list = []
            for port in port_list:
                new_port = []
                for entry in port:
                    if isinstance(entry, dict) and 'node' in entry:
                        entry = dict(entry)
                        entry['node'] = NODE_RENAMES.get(entry['node'], entry['node'])
                    new_port.append(entry)
                new_port_list.append(new_port)
            new_val[direction] = new_port_list
        new_conn[new_key] = new_val
    return new_conn

def process_file(fname):
    path = os.path.join(BASE, fname)
    with open(path, encoding='utf-8-sig') as f:
        wf = json.load(f)

    nodes = wf.get('nodes', [])
    changed = 0
    for i, node in enumerate(nodes):
        orig = json.dumps(node, sort_keys=True)
        nodes[i] = process_node(node)
        if json.dumps(nodes[i], sort_keys=True) != orig:
            changed += 1
            print(f"  [{fname}] updated node: {nodes[i]['name']}")

    wf['nodes'] = nodes

    # Fix connections dict
    if 'connections' in wf:
        wf['connections'] = fix_connections(wf['connections'])

    with open(path, 'w', encoding='utf-8') as f:
        json.dump(wf, f, indent=2, ensure_ascii=False)
    print(f"  [{fname}] {changed} node(s) updated")

FILES = [
    '00-master-pipeline.json',
    '05-notify.json',
    '06-meeting-summary.json',
    '07-trend-analysis.json',
]

for fname in FILES:
    print(f"\nProcessing {fname}...")
    process_file(fname)

print("\nDone.")
