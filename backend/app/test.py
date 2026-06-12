import os
import json
from dotenv import load_dotenv
import msal

load_dotenv()

GRAPH_TENANT_ID = os.getenv("GRAPH_TENANT_ID")
GRAPH_CLIENT_ID = os.getenv("GRAPH_CLIENT_ID")
GRAPH_CLIENT_SECRET = os.getenv("GRAPH_CLIENT_SECRET")

app = msal.ConfidentialClientApplication(
    client_id=GRAPH_CLIENT_ID,
    client_credential=GRAPH_CLIENT_SECRET,
    authority=f"https://login.microsoftonline.com/{GRAPH_TENANT_ID}"
)

result = app.acquire_token_for_client(
    scopes=["https://graph.microsoft.com/.default"]
)

print(json.dumps(result, indent=2))