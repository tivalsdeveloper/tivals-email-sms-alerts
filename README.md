# Tivals Email SMS Alerts

Private notification service for **tivalsdeveloper**.

## Goal

Watch a Gmail inbox for important new messages and send an SMS alert to the configured phone number.

## Architecture

Gmail -> Netlify scheduled function -> importance filter -> WoWSQL -> SMS provider -> phone

The implementation uses Gmail's API, WoWSQL, and Twilio-compatible SMS credentials. Secrets are supplied through deployment environment variables and are never committed to this repository.

## Important email categories

- University, admissions and bursaries
- Account security and payment problems
- Deadlines, appointments and official documents

## Required environment variables

```text
WOWSQL_DATABASE_URL=
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=
GMAIL_REFRESH_TOKEN=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=
SMS_TO_NUMBER=
```

## Deployment

Designed for Netlify Functions. This repository is connected to Netlify and production secrets are configured as environment variables.

Deployment refresh: 2026-09-03

Powered by tivalsdeveloper
