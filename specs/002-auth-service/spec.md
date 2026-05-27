# Feature Specification: Authentication Service

**Feature Branch**: `002-auth-service`  
**Created**: 2026-05-27  
**Status**: Draft  
**Input**: User description: "Create an authentication service depend on user db from user service"

## User Scenarios & Testing *(mandatory)*

<!--
  IMPORTANT: User stories should be PRIORITIZED as user journeys ordered by importance.
  Each user story/journey must be INDEPENDENTLY TESTABLE - meaning if you implement just ONE of them,
  you should still have a viable MVP (Minimum Viable Product) that delivers value.
  
  Assign priorities (P1, P2, P3, etc.) to each story, where P1 is the most critical.
  Think of each story as a standalone slice of functionality that can be:
  - Developed independently
  - Tested independently
  - Deployed independently
  - Demonstrated to users independently
-->

### User Story 1 - User Login (Priority: P1)

A registered user provides their email address and password to prove their identity. The
service verifies the credentials against the user records managed by the User Service,
and — on success — issues a signed access token and a refresh token that the caller can
use to authenticate subsequent requests to any protected service.

**Why this priority**: Login is the gateway to every protected operation across the
platform. Without a valid token, no other authenticated action is possible. This is the
minimum viable slice of the Authentication Service.

**Independent Test**: Can be fully tested by seeding a user record in the User Service
database, calling the login endpoint with valid credentials, and asserting that a
signed access token and a refresh token are returned. Delivers the ability to
authenticate users end-to-end.

**Acceptance Scenarios**:

1. **Given** a registered user with a known email and password, **When** they submit valid credentials, **Then** the service returns a signed access token and a refresh token, and the response includes the user's public identifier.
2. **Given** a registered user, **When** they submit the correct email but an incorrect password, **Then** the service returns a generic "invalid credentials" error without revealing which field was wrong.
3. **Given** a non-existent email, **When** a login attempt is made, **Then** the service returns the same generic "invalid credentials" error, indistinguishable from a wrong-password response.
4. **Given** a login request with a missing or malformed email or password field, **When** the request is processed, **Then** a descriptive validation error is returned before any credential check occurs.
5. **Given** repeated failed login attempts from the same origin within a short window, **When** the threshold is exceeded, **Then** further attempts are temporarily blocked to prevent brute-force attacks.

---

### User Story 2 - Token Verification (Priority: P2)

Any downstream service or API gateway needs to confirm that an incoming bearer token is
valid and has not been tampered with or expired, and to extract the user identity it
encodes — without contacting the User Service on every request.

**Why this priority**: Token verification is the most frequent operation in the system.
Every protected endpoint in every service relies on it. Once login works, verification
is the next critical building block.

**Independent Test**: Can be fully tested by obtaining a token via login and calling
the verify endpoint. The service must return the encoded user identity for a valid token
and a clear rejection for an invalid or expired one.

**Acceptance Scenarios**:

1. **Given** a valid, unexpired access token, **When** the verify endpoint is called, **Then** the service returns the user identity (user id, email) encoded in the token.
2. **Given** an expired access token, **When** the verify endpoint is called, **Then** the service returns an "token expired" error so the caller knows to refresh.
3. **Given** a tampered or malformed token, **When** the verify endpoint is called, **Then** the service returns an "invalid token" error.
4. **Given** no token in the request, **When** the verify endpoint is called, **Then** the service returns an "unauthorised" error.

---

### User Story 3 - Access Token Refresh (Priority: P3)

A user whose short-lived access token has expired uses their long-lived refresh token to
obtain a new access token without having to log in again, preserving a seamless
experience.

**Why this priority**: Short-lived access tokens are a security best practice. Without a
refresh mechanism, users would be forced to re-enter credentials frequently. This story
completes the standard session lifecycle.

**Independent Test**: Can be fully tested by logging in to obtain a refresh token,
waiting for (or simulating) access-token expiry, and calling the refresh endpoint with the
refresh token. The caller should receive a new, valid access token.

**Acceptance Scenarios**:

1. **Given** a valid, unexpired refresh token, **When** the refresh endpoint is called, **Then** the service issues a new access token (and optionally rotates the refresh token).
2. **Given** an expired or revoked refresh token, **When** the refresh endpoint is called, **Then** the service returns an error and the user must log in again.
3. **Given** a tampered or unrecognised refresh token, **When** the refresh endpoint is called, **Then** the service returns an "invalid token" error.

---

### User Story 4 - Logout (Priority: P4)

An authenticated user explicitly ends their session. The service revokes the current
refresh token so that it can no longer be used to obtain new access tokens, even if it has
not yet expired.

**Why this priority**: Logout is necessary for shared-device safety and account security,
but the system delivers value without it initially (tokens expire naturally).

**Independent Test**: Can be fully tested by logging in, calling the logout endpoint with
a valid refresh token, and confirming that a subsequent refresh attempt with the same
token is rejected.

**Acceptance Scenarios**:

1. **Given** a valid refresh token, **When** the logout endpoint is called, **Then** the token is invalidated and the response confirms success.
2. **Given** an already-revoked or expired refresh token, **When** logout is called, **Then** the service accepts the request gracefully (idempotent) without error.
3. **Given** no token in the logout request, **When** the endpoint is called, **Then** a validation error is returned.

---

### Edge Cases

- What happens when the User Service database is unreachable at login time? — The service returns a service-unavailable error without leaking internal details.
- What happens when a refresh token is presented that was already used once (replay attack)? — The service detects the reuse, revokes all tokens for that session, and forces re-login.
- What happens when a user's account is deleted from the User Service while they have active tokens? — Subsequent token verifications must eventually reflect the account's absence; at minimum, no new tokens are issued for deleted users after the next login attempt.
- What happens when two simultaneous login requests are made for the same account? — Both succeed independently; each receives its own token pair.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The service MUST verify a user's identity by checking their email and password against the user records stored in the User Service database.
- **FR-002**: The service MUST issue a short-lived access token and a longer-lived refresh token upon successful login.
- **FR-003**: The access token MUST encode the user's unique identifier and email so downstream services can identify the caller without querying the User Service.
- **FR-004**: The service MUST provide an endpoint to verify an access token and return the identity it encodes.
- **FR-005**: The service MUST provide an endpoint to exchange a valid refresh token for a new access token.
- **FR-006**: The service MUST provide a logout endpoint that revokes the supplied refresh token, preventing its future use.
- **FR-007**: The service MUST protect the login endpoint against brute-force credential attacks by enforcing a request-rate limit per origin.
- **FR-008**: The service MUST return consistent, non-revealing error messages for failed login attempts regardless of whether the email or password was incorrect.
- **FR-009**: The service MUST validate all incoming request payloads and reject malformed or incomplete input before performing any business logic.
- **FR-010**: The service MUST treat the User Service database as the single source of truth for user identity; it MUST NOT maintain its own copy of user profile data.
- **FR-011**: The service MUST log all authentication events (successful login, failed login, logout, token refresh) without recording sensitive credential values.

### Key Entities

- **Session**: Represents an active authentication context for a user. Tracks the issued refresh token, its expiry, and revocation status. A user may have multiple concurrent sessions (e.g., multiple devices).
- **Access Token**: A short-lived, self-contained credential that encodes user identity (user id, email) and an expiry time. Stateless — no server-side storage required.
- **Refresh Token**: A long-lived, opaque credential stored server-side (or in a fast store) that allows a client to obtain new access tokens without re-entering credentials. Must be revocable.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A registered user can complete the login flow and receive usable tokens in under 2 seconds under normal load conditions.
- **SC-002**: Token verification adds no more than 50 milliseconds of overhead to a downstream request's processing time.
- **SC-003**: The service correctly rejects 100% of tampered, expired, or revoked tokens in automated test scenarios.
- **SC-004**: Brute-force protection activates within 10 failed login attempts from the same origin within a 15-minute window.
- **SC-005**: The service sustains at least 500 concurrent authentication operations without degraded response times.
- **SC-006**: A revoked refresh token is rejected on first use after logout, with no window during which it remains usable.

## Assumptions

- The User Service database (with `email` and `passwordHash` fields on the User entity) is the authoritative store for credentials; the Authentication Service reads from it but does not write user profile data.
- The User Service and Authentication Service share database access within a trusted internal network; the Authentication Service does NOT expose the user database externally.
- Users are uniquely identified by their registered email address and their internal user id (as established by the User Service).
- Access tokens will have a short lifespan (15–60 minutes is the assumed default range); the exact duration is a configuration concern and not a specification decision.
- Refresh tokens will have a longer lifespan (days to weeks); the exact duration is a configuration concern.
- Social login (OAuth2 / SSO) and multi-factor authentication are out of scope for this version.
- Password reset / forgot-password flows are out of scope for this version.
- The service operates within a private microservice network; mutual TLS or equivalent transport security between services is assumed to be provided by the infrastructure layer.
- A single user may maintain multiple concurrent sessions (e.g., logged in on mobile and desktop simultaneously).

