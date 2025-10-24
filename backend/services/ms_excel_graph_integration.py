import os
import requests
import msal

# Load environment variables or replace with your own credentials directly here
CLIENT_ID = os.getenv("MS_GRAPH_CLIENT_ID", "your-client-id")
CLIENT_SECRET = os.getenv("MS_GRAPH_CLIENT_SECRET", "your-client-secret")
TENANT_ID = os.getenv("MS_GRAPH_TENANT_ID", "your-tenant-id")
AUTHORITY = f"https://login.microsoftonline.com/{TENANT_ID}"
SCOPES = ["https://graph.microsoft.com/.default"]

# Initialize MSAL confidential client
app = msal.ConfidentialClientApplication(
    client_id=CLIENT_ID,
    client_credential=CLIENT_SECRET,
    authority=AUTHORITY
)

# Acquire token for Graph API
def get_access_token():
    result = app.acquire_token_silent(SCOPES, account=None)
    if not result:
        result = app.acquire_token_for_client(scopes=SCOPES)
    if "access_token" in result:
        return result["access_token"]
    else:
        raise Exception("Could not acquire token: " + str(result.get("error_description")))

# Example function to read Excel file content using Microsoft Graph API
def read_excel_file(drive_id, item_id, worksheet_name, range_address):
    access_token = get_access_token()
    headers = {
        "Authorization": f"Bearer {access_token}"
    }

    url = f"https://graph.microsoft.com/v1.0/drives/{drive_id}/items/{item_id}/workbook/worksheets/{worksheet_name}/range(address='{range_address}')"
    response = requests.get(url, headers=headers)

    if response.status_code == 200:
        return response.json()
    else:
        raise Exception(f"Failed to fetch Excel range: {response.text}")
