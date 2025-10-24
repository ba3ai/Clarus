# backend/google_sheets_service.py
import os
import pickle
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"]

def get_google_sheets_service():
    creds = None
    if os.path.exists("token_gsheets.pickle"):
        with open("token_gsheets.pickle", "rb") as token:
            creds = pickle.load(token)
    else:
        flow = InstalledAppFlow.from_client_secrets_file("credentials_gsheets.json", SCOPES)
        creds = flow.run_local_server(port=0)
        with open("token_gsheets.pickle", "wb") as token:
            pickle.dump(creds, token)

    service = build("sheets", "v4", credentials=creds)
    return service

def read_google_sheet(spreadsheet_id, range_name):
    service = get_google_sheets_service()
    result = service.spreadsheets().values().get(
        spreadsheetId=spreadsheet_id, range=range_name).execute()
    return result.get("values", [])
