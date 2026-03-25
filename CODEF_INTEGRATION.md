# Codef API Integration Guide

## Overview
This document describes the complete Codef API integration for the FMI ERP system, enabling automatic bank transaction and credit card approval history synchronization.

## File Structure

### API Routes
```
app/api/codef/
├── lib/
│   ├── auth.ts          # OAuth 2.0 token management with caching
│   └── crypto.ts        # RSA encryption for passwords
├── connect/route.ts     # Manage connected accounts (create/list/delete)
├── bank/route.ts        # Fetch bank transaction history
├── card/route.ts        # Fetch card approval history
└── sync/route.ts        # Master sync endpoint (all accounts)
```

### UI Page
```
app/finance/codef/page.tsx  # Admin management interface
```

### Database
```
supabase/migrations/20260325_codef_tables.sql
```

### Configuration
```
.env.local              # Environment variables (development)
Dockerfile              # Docker environment variables (production)
```

## Environment Variables

### Required Variables
Add these to `.env.local` and Dockerfile:

```env
CODEF_CLIENT_ID=64132559-5368-4f43-8918-aedbfc7c3ea0
CODEF_CLIENT_SECRET=7fb37e4b-fe96-4a4d-93b0-8f4fd8a3124b
CODEF_PUBLIC_KEY=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEArd5iIdcfWNfEOv0U68sDl1x6Rmpc8Shf3J1lVtBnZoXH2lAIPoSy7GiJQN42fptjAocM8KesXvCF4GrljViFtRAYfkdQCB/mcjT4ZFZcm9r8chpEsw5grBMushaRl1Kfh4lUVLB2sJDNA42V1YTSZAvx+oM2vmQxFGpDEoC7KWRjZzM8tmPtE1cvzkJR6M2vC0Zv0SnofHOTSaFnY6x3o8511KrJvGfQ3ThUh6jR8zJmCbGMIMShBLVbnkpnkzzT+jpkiqP2MKbqlakCuKMx6RhljYrhSTG21vsRrg/2ovmdpqD79yVrvc4W/MUgVylcBrfTCnDkM5JajFjpY1hTpwIDAQAB
CODEF_API_HOST=https://development.codef.io
CODEF_TOKEN_URL=https://oauth.codef.io/oauth/token
```

## Database Schema

### codef_connections Table
Stores connected bank and credit card accounts.

```sql
CREATE TABLE codef_connections (
  id uuid PRIMARY KEY,
  connected_id text NOT NULL,          -- Unique ID from Codef
  org_type text NOT NULL,              -- 'bank' | 'card'
  org_code text NOT NULL,              -- Organization code (0020=우리은행)
  org_name text NOT NULL,              -- Organization name
  account_number text,                 -- Account or card number
  is_active boolean DEFAULT true,      -- Active status
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

### codef_sync_logs Table
Tracks sync history and errors.

```sql
CREATE TABLE codef_sync_logs (
  id uuid PRIMARY KEY,
  sync_type text NOT NULL,             -- 'bank' | 'card' | 'all'
  org_name text,                       -- Organization name
  fetched integer DEFAULT 0,           -- Records fetched from API
  inserted integer DEFAULT 0,          -- Records inserted to DB
  status text DEFAULT 'success',       -- 'success' | 'error'
  error_message text,                  -- Error details if failed
  synced_at timestamptz DEFAULT now()
);
```

## API Endpoints

### 1. POST /api/codef/connect
Create or add connected accounts.

**Request:**
```json
{
  "action": "create" | "add",
  "orgCode": "0020",
  "accountNumber": "123-456-789012",
  "password": "account_password",
  "connectedId": "optional_for_add_action"
}
```

**Response (Success):**
```json
{
  "success": true,
  "connectedId": "conn_12345",
  "message": "계정이 정상적으로 연동되었습니다."
}
```

### 2. GET /api/codef/connect
List all connected accounts.

**Response:**
```json
{
  "connections": [
    {
      "id": "uuid",
      "connected_id": "conn_12345",
      "org_type": "bank",
      "org_code": "0020",
      "org_name": "우리은행",
      "account_number": "123-456-789012",
      "is_active": true
    }
  ]
}
```

### 3. DELETE /api/codef/connect
Remove a connected account.

**Request:**
```json
{
  "id": "uuid"
}
```

### 4. POST /api/codef/bank
Fetch bank transaction history.

**Request:**
```json
{
  "connectedId": "conn_12345",
  "orgCode": "0020",
  "startDate": "2024-01-01",
  "endDate": "2024-12-31"
}
```

**Response:**
```json
{
  "success": true,
  "fetched": 150,
  "inserted": 150,
  "transactions": [...]
}
```

### 5. POST /api/codef/card
Fetch credit card approval history.

**Request:**
```json
{
  "connectedId": "conn_12345",
  "orgCode": "0019",
  "startDate": "2024-01-01",
  "endDate": "2024-12-31"
}
```

### 6. POST /api/codef/sync
Master sync endpoint for all connected accounts.

**Request:**
```json
{
  "startDate": "2024-01-01",
  "endDate": "2024-12-31"
}
```

**Response:**
```json
{
  "success": true,
  "summary": {
    "banks": {
      "fetched": 300,
      "inserted": 300
    },
    "cards": {
      "fetched": 150,
      "inserted": 150
    },
    "errors": []
  }
}
```

### 7. GET /api/codef/sync
Fetch sync logs.

**Query Parameters:**
- `limit`: Number of logs to return (default: 20)

## Organization Codes

### Banks
| Code | Name | Region |
|------|------|--------|
| 0020 | 우리은행 (Woori Bank) | South Korea |
| 0004 | 국민은행 (KB Kookmin Bank) | South Korea |

### Credit Cards
| Code | Name | Region |
|------|------|--------|
| 0019 | 우리카드 (Woori Card) | South Korea |
| 0381 | 국민카드 (KB National Card) | South Korea |
| 0041 | 현대카드 (Hyundai Card) | South Korea |

## Admin UI (`/finance/codef`)

### Features

1. **Connected Accounts Section**
   - Lists all connected bank and credit card accounts
   - Shows account number, connection date, and status
   - One-click account disconnect

2. **Account Connection Form**
   - Add new accounts
   - Add accounts to existing connections (connectedId)
   - Support for all bank and card codes
   - RSA-encrypted password transmission

3. **Sync Section**
   - Date range selection (start/end date)
   - Manual sync trigger button
   - Syncs all connected accounts simultaneously

4. **Sync History**
   - Last 20 sync operations
   - Shows fetched/inserted counts
   - Status indicators (success/error)
   - Error message display for failed syncs

## Security Notes

### Password Encryption
- Passwords are encrypted using RSA with PKCS1 padding
- Public key from Codef is used for encryption
- Encrypted passwords sent to Codef API
- Original passwords never stored in database

### OAuth 2.0 Token Management
- Access tokens cached in memory with 1-week validity
- Automatic refresh with 1-hour buffer
- Invalid tokens trigger new token request
- Bearer token used for all API requests

### Database Security
- RLS (Row Level Security) enabled on all tables
- Authenticated users can access sync logs
- Connection details restricted to connected accounts

## Data Flow

### Connection Process
1. User enters account credentials in UI
2. Password encrypted with RSA public key
3. Encryption credentials sent to `/api/codef/connect`
4. Codef API validates credentials and returns `connectedId`
5. `connectedId` stored in `codef_connections` table
6. Success message shown to user

### Sync Process
1. User selects date range and clicks "지금 동기화"
2. Request sent to `/api/codef/sync` with date range
3. Sync endpoint queries all active connections from database
4. For each connection:
   - Bank: Calls `/api/codef/bank`
   - Card: Calls `/api/codef/card`
5. Each API transforms and inserts data into `transactions` table
6. Sync log entry created with summary
7. Results aggregated and returned to UI

### Data Transformation
- **Bank Transactions**: Mapped to expense/income based on transaction type
- **Card Approvals**: Always mapped as expenses
- **Category**: Auto-set to "Import - Bank" or "Import - Card"
- **Payment Method**: Set to institution name
- **Status**: Always "completed"
- **Raw Data**: Original Codef response stored in JSONB field

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| Invalid organization code | Wrong bank/card code | Select from dropdown menu |
| Missing required parameters | Empty form fields | Fill all fields |
| Codef token error 401 | Invalid credentials | Check CLIENT_ID/SECRET in env |
| Failed to create account | Incorrect account details | Verify account number and password |
| Database error | Connection issue | Check Supabase connection |

### Logging
- All errors logged to browser console (client-side)
- API errors logged to server console
- Sync logs stored in `codef_sync_logs` table
- Each sync operation creates log entry regardless of result

## Testing

### Test with Demo Credentials
The provided credentials are for Codef's demo environment:
- Returns mock data for testing
- No real accounts created
- Useful for UI and workflow testing

### Test Endpoints (cURL)
```bash
# Test token endpoint
curl -X POST https://oauth.codef.io/oauth/token \
  -H "Authorization: Basic BASE64_ENCODED_CREDENTIALS" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&scope=read"

# Create connection
curl -X POST http://localhost:3000/api/codef/connect \
  -H "Content-Type: application/json" \
  -d '{
    "action": "create",
    "orgCode": "0020",
    "accountNumber": "123-456-789012",
    "password": "password123"
  }'

# Fetch bank transactions
curl -X POST http://localhost:3000/api/codef/bank \
  -H "Content-Type: application/json" \
  -d '{
    "connectedId": "conn_xxxxx",
    "orgCode": "0020",
    "startDate": "2024-01-01",
    "endDate": "2024-12-31"
  }'

# Sync all accounts
curl -X POST http://localhost:3000/api/codef/sync \
  -H "Content-Type: application/json" \
  -d '{
    "startDate": "2024-01-01",
    "endDate": "2024-12-31"
  }'
```

## Performance Considerations

### Token Caching
- Access tokens cached for 1 week
- In-memory cache shared across requests
- 1-hour buffer before refresh to avoid expiration

### Batch Processing
- Bank transactions processed in single API call per account
- Card approvals processed in single API call per account
- All accounts synced in parallel (via Promise.all in future optimization)
- No automatic retry - user must retry failed syncs

### Database
- Indexes on `connected_id`, `org_code`, `is_active`
- Sync logs indexed on `sync_type`, `synced_at`, `status`
- Historical data retained indefinitely

## Future Enhancements

1. **Automatic Scheduling**: Daily sync at scheduled time
2. **Parallel Processing**: Use Promise.all for concurrent syncs
3. **Incremental Sync**: Only fetch new transactions since last sync
4. **Duplicate Detection**: Prevent duplicate transaction imports
5. **Real-time Sync**: Webhook from Codef for instant updates
6. **Transaction Matching**: Auto-match imported transactions to existing records
7. **Bank Reconciliation**: Built-in reconciliation workflow
8. **Multi-user Support**: Account sharing and permissions
9. **Data Export**: Export sync history and statistics
10. **Connection Health**: Monitor connection status and alert on failures

## Troubleshooting

### Connection Fails
1. Verify account number format
2. Confirm password is correct
3. Check account is not locked at bank
4. Try with different account if available

### No Data Returned
1. Check date range overlaps existing transactions
2. Confirm account has transactions in date range
3. Try longer date range to test
4. Check sync logs for specific errors

### Token Errors
1. Clear browser cache and retry
2. Restart application if running locally
3. Verify environment variables are set
4. Check Codef API status page

## Support

For Codef API support:
- Documentation: https://codef.io/docs
- Status Page: https://status.codef.io
- Email: support@codef.io

For integration support:
- Check CODEF_INTEGRATION.md (this file)
- Review API route implementations
- Check browser console for errors
- Review Supabase logs for database errors
