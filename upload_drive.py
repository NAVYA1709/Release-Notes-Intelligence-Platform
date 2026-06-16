import os
import argparse
import google.auth
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaFileUpload

def upload_file_to_drive(file_path, mime_type=None, parent_folder_id=None):
    """
    Uploads a local file to Google Drive.
    
    Parameters:
        file_path (str): Path to the local file to upload.
        mime_type (str, optional): The MIME type of the file. If not specified, 
                                   Drive will attempt to detect it.
        parent_folder_id (str, optional): ID of the Google Drive folder to upload 
                                          the file into.
    
    Returns:
        str: ID of the uploaded file if successful, None otherwise.
    """
    if not os.path.exists(file_path):
        print(f"Error: The local file path '{file_path}' does not exist.")
        return None

    # Resolve filename from the path
    filename = os.path.basename(file_path)

    # 1. Load pre-authorized credentials from the environment
    # Ensure GOOGLE_APPLICATION_CREDENTIALS environment variable is set
    try:
        creds, _ = google.auth.default(scopes=['https://www.googleapis.com/auth/drive.file'])
    except google.auth.exceptions.DefaultCredentialsError as cred_err:
        print("Credentials Error: Could not find Application Default Credentials.")
        print("Please set the GOOGLE_APPLICATION_CREDENTIALS environment variable to the path of your Service Account JSON key.")
        print(f"Details: {cred_err}")
        return None

    try:
        # 2. Build the Google Drive API client
        service = build("drive", "v3", credentials=creds)

        # 3. Define file metadata
        file_metadata = {
            "name": filename
        }

        # If a parent folder is specified, add it to the metadata parents array
        if parent_folder_id:
            file_metadata["parents"] = [parent_folder_id]

        # 4. Prepare local media for upload
        # We specify resumable=True for robust uploading of varying file sizes
        media = MediaFileUpload(file_path, mimetype=mime_type, resumable=True)

        print(f"Uploading '{filename}' to Google Drive...")
        
        # 5. Execute file creation request
        file = (
            service.files()
            .create(body=file_metadata, media_body=media, fields="id")
            .execute()
        )
        
        uploaded_id = file.get("id")
        print(f"Success! File '{filename}' uploaded successfully.")
        print(f"Google Drive File ID: {uploaded_id}")
        return uploaded_id

    except HttpError as error:
        print(f"An API error occurred during the upload: {error}")
        return None
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        return None

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Upload a local file to Google Drive using Drive API v3.")
    parser.add_argument("file", help="Path to the local file to upload")
    parser.add_argument("--mime", help="MIME type of the file (e.g., image/jpeg, text/csv)")
    parser.add_argument("--folder", help="Target Google Drive Folder ID to upload the file into")
    
    args = parser.parse_args()
    
    upload_file_to_drive(args.file, mime_type=args.mime, parent_folder_id=args.folder)
