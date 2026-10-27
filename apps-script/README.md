# Apps Script (missing model + feedback intake)

`Code.gs` is the web app behind `MISSING_MODEL_URL` (tools/missing-model.js). Missing-model posts go to the
**Submissions** tab exactly as before. `{type:"feedback", message, version}` posts go to a **Feedback** tab
(created on first use with headers Timestamp, Message, App version, Status; new rows get Status `New`).

## Redeploy (URL stays the same)
1. Open the script (Extensions → Apps Script from the sheet), replace the contents of `Code.gs` with this file, save.
2. **Deploy → Manage deployments**.
3. Select the existing web-app deployment, tap the **pencil (Edit)**.
4. **Version: New version**.
5. **Deploy**. The /exec URL does not change, so the app needs no update.

Don't use "New deployment": that makes a new URL.
