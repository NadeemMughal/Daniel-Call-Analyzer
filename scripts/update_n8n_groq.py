import json, urllib.request, urllib.error

import os, re

def load_env(path="../.env"):
    env = {}
    try:
        with open(os.path.join(os.path.dirname(__file__), path)) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, _, v = line.partition('=')
                    env[k.strip()] = v.strip().strip('"\'')
    except FileNotFoundError:
        pass
    return env

_env = load_env()
N8N_KEY = _env.get("N8N_API_KEY") or os.environ.get("N8N_API_KEY", "")
GROQ_KEY = _env.get("GROQ_API_KEY") or os.environ.get("GROQ_API_KEY", "")
WF_ID = "bzjBTtDYINXPrHk9"
BASE = "https://n8nserver.metaviz.pro/api/v1"

def n8n_get(path):
    req = urllib.request.Request(BASE + path, headers={"X-N8N-API-KEY": N8N_KEY})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read())

def n8n_put(path, body):
    data = json.dumps(body).encode()
    req = urllib.request.Request(BASE + path, data=data, method="PUT",
        headers={"X-N8N-API-KEY": N8N_KEY, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        print("HTTP Error:", e.code, e.reason)
        print("Response:", e.read().decode())
        raise

wf = n8n_get(f"/workflows/{WF_ID}")
print(f"Fetched: {wf['name']} ({len(wf['nodes'])} nodes)")

changed = 0
for node in wf["nodes"]:
    name = node.get("name", "")
    params = node.get("parameters", {})

    if name == "Turn 2: Score Call":
        node.pop("credentials", None)
        params.pop("authentication", None)
        params.pop("genericAuthType", None)
        params["url"] = "https://api.groq.com/openai/v1/chat/completions"
        params["headerParameters"] = {"parameters": [
            {"name": "Authorization", "value": f"Bearer {GROQ_KEY}"},
            {"name": "content-type", "value": "application/json"},
        ]}
        params["jsonBody"] = "={{ { model: 'llama-3.3-70b-versatile', max_tokens: 4000, messages: [{ role: 'system', content: $json.systemPrompt }, { role: 'user', content: $json.turn2UserMsg }] } }}"
        node["parameters"] = params
        changed += 1
        print("  Updated: Turn 2: Score Call")

    elif name == "Turn 3: Synthesis":
        node.pop("credentials", None)
        params.pop("authentication", None)
        params.pop("genericAuthType", None)
        params["url"] = "https://api.groq.com/openai/v1/chat/completions"
        params["headerParameters"] = {"parameters": [
            {"name": "Authorization", "value": f"Bearer {GROQ_KEY}"},
            {"name": "content-type", "value": "application/json"},
        ]}
        params["jsonBody"] = (
            "={{ { model: 'llama-3.3-70b-versatile', max_tokens: 500, messages: [ "
            "{ role: 'system', content: 'You are a sales coaching assistant. Return only raw JSON.' }, "
            "{ role: 'user', content: $('Build Enriched Request').first().json.turn2UserMsg }, "
            "{ role: 'assistant', content: $('Turn 2: Score Call').first().json.choices?.[0]?.message?.content || '' }, "
            r"{ role: 'user', content: 'Synthesis as raw JSON only: {\"manager_summary\":\"2-sentence manager summary\",\"positive_reinforcement\":\"one specific strength\"}' }"
            "] } }}"
        )
        node["parameters"] = params
        changed += 1
        print("  Updated: Turn 3: Synthesis")

    elif name == "Merge Agent Output":
        code = params.get("jsCode", "")
        code = code.replace(
            "($('Turn 2: Score Call').first().json.content || [{}])[0].text || ''",
            "$('Turn 2: Score Call').first().json.choices?.[0]?.message?.content || ''"
        ).replace(
            "($('Turn 3: Synthesis').first().json.content || [{}])[0].text || ''",
            "$('Turn 3: Synthesis').first().json.choices?.[0]?.message?.content || ''"
        )
        params["jsCode"] = code
        node["parameters"] = params
        changed += 1
        print("  Updated: Merge Agent Output")

print(f"Total nodes patched: {changed}")

# Strip read-only fields n8n rejects in PUT
settings = {k: v for k, v in (wf.get("settings") or {}).items() if k in ("executionOrder", "saveManualExecutions", "callerPolicy", "errorWorkflow", "timezone")}
payload = {"name": wf["name"], "nodes": wf["nodes"], "connections": wf["connections"], "settings": settings}

result = n8n_put(f"/workflows/{WF_ID}", payload)
print(f"Saved to n8n. Active: {result.get('active')}, nodes: {len(result.get('nodes', []))}")
