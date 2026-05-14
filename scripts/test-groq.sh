#!/bin/bash
# Quick test of Groq classifier against the test payload, using curl

set -e
cd "$(dirname "$0")/.."

ATTENDEES='[{"name":"Zain Ali","email":"zain@webuildtrades.com"},{"name":"Daniel Brown","email":"daniel@webuildtrades.com"}]'
TRANSCRIPT_HEAD=$(python3 -c "import json; print(json.load(open('docs/test-payload.json'))['transcript']['full_transcript'][:2000])")

# Build JSON payload safely via python
python3 - <<'PYEOF' > /tmp/groq-classify.json
import json
attendees = [
  {"name":"Zain Ali","email":"zain@webuildtrades.com"},
  {"name":"Daniel Brown","email":"daniel@webuildtrades.com"}
]
transcript = json.load(open('docs/test-payload.json'))['transcript']['full_transcript'][:2000]
body = {
  "model": "llama-3.1-8b-instant",
  "max_tokens": 300,
  "messages": [
    {"role":"system","content":"You classify business calls. Types: discovery (first meeting with a prospective new client), ads_intro (introducing advertising services), launch (onboarding/kickoff with a new client), follow_up (check-in with an existing client), team (INTERNAL meeting between WeBuildTrades staff only - no external clients), other. CRITICAL: if EVERY attendee email ends with @webuildtrades.com, the call is ALWAYS team. Return JSON only: {\"call_type\":\"...\",\"confidence\":0.9,\"reasoning\":\"one sentence\"}"},
    {"role":"user","content":"Attendees: " + json.dumps(attendees) + "\nTranscript excerpt:\n" + transcript}
  ]
}
print(json.dumps(body))
PYEOF

echo "=== Classifier output ==="
curl -s -X POST "https://api.groq.com/openai/v1/chat/completions" \
  -H "Authorization: Bearer ${GROQ_API_KEY}" \
  -H "Content-Type: application/json" \
  -d @/tmp/groq-classify.json \
  | python3 -c "import sys, json; d = json.load(sys.stdin); print(d['choices'][0]['message']['content']); print(); print('Usage:', d.get('usage'))"
