# Paper.id API Endpoints Discovery

Base URL: `https://api.paper.id`

## Authentication Endpoints

### 1. Check Account
**POST** `/api/v1/auth/login/user/check-account`
- Check if phone/email has account
- Request: `{"phone":"08996926184"}`
- Response: `{"data":{"multiple":false,"has_password":true},"status":200}`

### 2. Login with Password
**POST** `/api/v1/auth/login/user`
- Login with password
- Request: `{"password":"xxx","ttl":31104000,"ip_address":"x.x.x.x","phone":"08996926184","fingerprint":""}`
- Response: User data + token + companies list
- Returns: `token`, `uuid`, `name`, `email`, `phone`, `companies[]`

### 3. Validate Device
**POST** `/api/v1/auth/login/user/validate-device`
- Check if device is new
- Request: `{"user_id":"uuid","fingerprint":"xxx"}`
- Response: `{"is_new_device":true,"challenge":"xxx"}`

### 4. Send OTP
**POST** `/api/v1/auth/fingerprints/send-otp`
- Send OTP for device verification
- Request: `{"token":"xxx","method":"whatsapp","phone":"628996926184"}`
- Methods: `whatsapp`, `sms`, `email`
- Response: `{"message":"OTP_SENT","status":"ok"}`

### 5. Verify OTP
**POST** `/api/v1/auth/fingerprints/verify-otp`
- Verify OTP code
- Request: `{"otp":"539292","recipient":"628996926184"}`
- Response: `{"message":"OTP_VERIFIED","status":"ok"}`

### 6. Final Login
**POST** `/api/v1/auth/login-v2`
- Complete login with device verification
- Request: `{"user_id":"uuid","company_id":"uuid","token":"xxx","ip_address":"x.x.x.x","remember_me":false,"fingerprint_challenge":"xxx","ttl":86400,"fingerprint_id":"xxx","fingerprint_request_id":"xxx"}`
- Response: Full user + company + subscription data
- Sets cookie: `refresh_token` (HttpOnly, Secure, SameSite=Strict)
- Returns JWT in response body for Authorization header

## Company & User Endpoints

### 7. Get Company Details
**GET** `/api/v1/companies/{company_id}`
- Headers: `Authorization: Bearer {jwt_token}`
- Response: Company full details

### 8. Get User Details
**GET** `/api/v1/users/{user_id}`
- Headers: `Authorization: Bearer {jwt_token}`
- Response: User profile

### 9. Get Current User
**GET** `/api/v1/milky-way/users/me`
- Headers: `Authorization: Bearer {jwt_token}`
- Response: Current user info

### 10. Get User Role
**GET** `/api/v1/milky-way/users/role?time={timestamp}&entry_source=PAPER_MENU`
- Headers: `Authorization: Bearer {jwt_token}`
- Response: User module roles

### 11. Get User Package
**GET** `/api/v1/users/package`
- Headers: `Authorization: Bearer {jwt_token}`
- Response: Subscription package info

### 12. Get Onboarding Status
**GET** `/api/v1/milky-way/companies/onboarding-status`
- Headers: `Authorization: Bearer {jwt_token}`
- Response: Company onboarding completion status

## Invoice Endpoints

### 13. Get All Sales Invoices
**POST** `/api/v1/invoicer/sales-invoices/all`
- Headers: `Authorization: Bearer {jwt_token}`
- Request: Filters + pagination
```json
{
  "filters": {
    "number": {"matchMode":"undefined","value":""},
    "client_name": {"matchMode":"undefined","value":null},
    "status": {"matchMode":"undefined","value":[]},
    "start_invoice_date": {"matchMode":"undefined","value":""},
    "end_invoice_date": {"matchMode":"undefined","value":""}
  },
  "first": 0,
  "rows": 10,
  "sortOrder": -1,
  "sortField": "created_at",
  "show": "existing"
}
```
- Response: Invoice list with full details

### 14. Get Invoice Settings
**GET** `/api/v1/invoicer/settings/invoice`
- Headers: `Authorization: Bearer {jwt_token}`
- Response: Invoice configuration

### 15. Get Currency List
**GET** `/api/v1/invoicer/currency`
- Headers: `Authorization: Bearer {jwt_token}`
- Response: Available currencies

## Partner Endpoints

### 16. Get All Partners
**POST** `/api/v1/invoicer/partners/all`
- Headers: `Authorization: Bearer {jwt_token}`
- Request: Filters + pagination
- Response: Partner/client list

## Payment Endpoints

### 17. Get Payment Requests
**POST** `/api/v1/documents/payment-request/all`
- Headers: `Authorization: Bearer {jwt_token}`
- Response: Payment request list

### 18. Get Payment Reconciliation
**POST** `/api/v1/payment-api/reconcile/all`
- Headers: `Authorization: Bearer {jwt_token}`
- Response: Reconciliation data

### 19. Get Settlement Finance Account
**POST** `/api/v1/invoicer/digital-payment/get-settlement-finance-account`
- Headers: `Authorization: Bearer {jwt_token}`
- Response: Finance account for settlements

### 20. Get Disbursement Finance Account
**GET** `/api/v1/payment-api/disbursement/finance-account`
- Headers: `Authorization: Bearer {jwt_token}`
- Response: Disbursement account info

### 21. Get Static VA Total Not Reconciled
**GET** `/api/v1/payment-api/reconcile/static-va/total-not-reconciled`
- Headers: `Authorization: Bearer {jwt_token}`
- Response: Unreconciled virtual account total

### 22. KYC Payout Payment
**POST** `/api/v1/payment-api/kyc/payout-payment`
- Headers: `Authorization: Bearer {jwt_token}`
- Response: KYC status for payout

## Reporting Endpoints

### 23. Dashboard Profit & Loss
**POST** `/api/v1/reporting/dashboard/profit-and-loss`
- Headers: `Authorization: Bearer {jwt_token}`
- Response: P&L chart data

### 24. Account Receivable Insight
**GET** `/api/v1/reporting/account-receivable/insight`
- Headers: `Authorization: Bearer {jwt_token}`
- Response: AR summary (unpaid, partially paid, overdue)

### 25. Account Payable Insight
**GET** `/api/v1/reporting/account-payable/insight`
- Headers: `Authorization: Bearer {jwt_token}`
- Response: AP summary

### 26. Get Banners
**GET** `/api/v1/reporting/banners?platform=web`
- Headers: `Authorization: Bearer {jwt_token}`
- Response: Promotional banners

## Dashboard Endpoints

### 27. Get To-Do List
**GET** `/api/v1/invoicer/dashboard/to-do-list`
- Headers: `Authorization: Bearer {jwt_token}`
- Response: Dashboard tasks

### 28. Get To-Do List Reward
**GET** `/api/v1/invoicer/dashboard/to-do-list/reward`
- Headers: `Authorization: Bearer {jwt_token}`
- Response: Reward status

## KYC/KYB Endpoints

### 29. Get KYC Status
**GET** `/api/v1/paper-kyc/kyc`
- Headers: `Authorization: Bearer {jwt_token}`
- Response: KYC verification status

### 30. Get Business Types
**GET** `/api/v1/companies/business-type/id`
- Headers: `Authorization: Bearer {jwt_token}`
- Response: Business type list

## Feature Flag Endpoints

### 31. Get All Flags
**POST** `/api/v1/feature-flagging/list-all-flags`
- Headers: `Authorization: Bearer {jwt_token}`
- Response: Feature flags for user

**POST** `https://feature-flag.paper.id/v1/allflags`
- Alternative feature flag endpoint
- Response: Feature toggles

### 32. Feature Flag Data Collector
**POST** `https://feature-flag.paper.id/v1/data/collector`
- Analytics for feature usage

## Notification Endpoints

### 33. Get Notifications
**POST** `/api/v1/notification/notifications`
- Headers: `Authorization: Bearer {jwt_token}`
- Response: User notifications

### 34. Get Updates
**POST** `/api/v1/notification/updates`
- Headers: `Authorization: Bearer {jwt_token}`
- Response: System updates

## Referral Endpoints

### 35. Get Referral Link
**GET** `/api/v1/referral-code/link`
- Headers: `Authorization: Bearer {jwt_token}`
- Response: User referral code + link

## Tax & Accounting Endpoints

### 36. Get Tax Settings Seeds
**GET** `/api/v1/accounting/tax-settings/seeds`
- Headers: `Authorization: Bearer {jwt_token}`
- Response: Default tax configurations

### 37. Get Stamp Info
**GET** `/api/v1/signing-api/stamp/{company_id}`
- Headers: `Authorization: Bearer {jwt_token}`
- Response: E-meterai stamp info

## Paper Plus Endpoints

### 38. Get Paper Plus Counter
**GET** `/api/v1/invoicer/paper-plus/counter`
- Headers: `Authorization: Bearer {jwt_token}`
- Response: Usage counter for Paper Plus features

## Maintenance & System Endpoints

### 39. Get Maintenance Banners
**GET** `/api/v1/sirius/maintenance-banners`
- Response: System maintenance notifications

### 40. Get Application Status
**GET** `/api/v1/sirius/application-status`
- Response: Application health status

### 41. Get Consultation Banner Status
**GET** `/api/v1/milky-way/consultations/sticky-banner/status`
- Headers: `Authorization: Bearer {jwt_token}`
- Response: Consultation banner visibility

## Integration Endpoints

### 42. Get Languages
**GET** `/api/v1/languages`
- Response: Available languages

### 43. Login By (Session)
**POST** `/api/v1/login-by`
- Headers: `Authorization: Bearer {jwt_token}`
- Track login method

### 44. Get User Onboarding
**GET** `/api/v1/users/onboarding-user`
- Headers: `Authorization: Bearer {jwt_token}`
- Response: Onboarding progress

### 45. Get Module Role Settings
**GET** `/api/v1/module-role-settings/user-module-role-setting/{setting_id}?time={timestamp}`
- Headers: `Authorization: Bearer {jwt_token}`
- Response: User module permissions

### 46. Get Paper Trade Paylater Summary
**GET** `/api/v1/paper-trade/paylater/summary`
- Headers: `Authorization: Bearer {jwt_token}`
- Response: Paylater credit summary

### 47. Get Custom Theme
**GET** `/api/v1/milky-way/companies/custom-theme`
- Headers: `Authorization: Bearer {jwt_token}`
- Response: Company branding theme (204 if none)

### 48. Get BRI Co-Branding Setting
**GET** `/api/v1/bank-account-api/bri-co-branding/company-mmu-setting`
- Headers: `Authorization: Bearer {jwt_token}`
- Response: BRI integration settings

### 49. Get Milky Way User Onboarding
**GET** `/api/v1/milky-way/users/onboarding`
- Headers: `Authorization: Bearer {jwt_token}`
- Response: User onboarding status

## External Services

### 50. IP Geolocation
**GET** `https://api.ipinfodb.com/v3/ip-city/?key={api_key}&ip={ip_address}&format=json`
- Get user location from IP

### 51. Get Public IP
**GET** `https://api.ipify.org/?format=json`
- Get user's public IP address

## Authentication Flow

1. **Check Account** → `/api/v1/auth/login/user/check-account`
2. **Login** → `/api/v1/auth/login/user`
3. **Validate Device** → `/api/v1/auth/login/user/validate-device`
4. If new device:
   - **Send OTP** → `/api/v1/auth/fingerprints/send-otp`
   - **Verify OTP** → `/api/v1/auth/fingerprints/verify-otp`
5. **Final Login** → `/api/v1/auth/login-v2`
6. Use JWT from response in `Authorization: Bearer {token}` header

## Headers Required

All authenticated requests need:
```
Authorization: Bearer {jwt_token}
Content-Type: application/json
x-paper-user-agent: Jupiter/7.15.16 desktop (linux) Chrome 146
request-id: {unique_request_id}
url: {current_page_url}
```

## Notes

- JWT expires based on `ttl` parameter (86400 = 1 day, 31104000 = 1 year)
- Refresh token stored in HttpOnly cookie
- Device fingerprinting used for security
- Most POST endpoints use filters + pagination pattern
- Response format: `{"header":{"process_time":"x ms","is_success":true},"body":{...}}`
