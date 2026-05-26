# Feature Specification: Simple User Service

**Feature Branch**: `001-user-service`  
**Created**: 2026-05-26  
**Status**: Draft  
**Input**: User description: "Create a simple user service"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - User Registration (Priority: P1)

A visitor provides their full name, email address, and a password to create a new account.
The service validates the input, ensures the email is not already taken, securely stores the
credentials, and returns a confirmation with the newly created user's public profile.

**Why this priority**: Registration is the entry point for all other operations. No other
user story is reachable without a user record existing in the system. It is also the only
public-facing operation in this service, making it the minimal viable slice.

**Independent Test**: Can be fully tested by submitting a valid registration payload and
verifying a user record is created. No authentication or other story is required.

**Acceptance Scenarios**:

1. **Given** no account exists for an email, **When** a visitor submits a valid name, email, and password, **Then** a user record is created and the response includes the user's id, name, email, and creation timestamp (no password).
2. **Given** an account already exists for an email, **When** a visitor attempts to register with that same email, **Then** the request is rejected with a conflict error and no duplicate record is created.
3. **Given** a registration request, **When** any required field (name, email, or password) is missing or malformed, **Then** the request is rejected with a descriptive validation error.
4. **Given** a registration request, **When** the email format is invalid, **Then** the request is rejected before any persistence occurs.

---

### User Story 2 - View Own Profile (Priority: P2)

An authenticated user retrieves their own profile information to view their account details.

**Why this priority**: Read access to one's own data is the most common operation after
registration and is required to verify that account creation and updates succeeded correctly.

**Independent Test**: Can be fully tested by registering a user, obtaining a valid auth
token from the Authentication Service, and calling the get-profile endpoint. Delivers the
ability to inspect account data.

**Acceptance Scenarios**:

1. **Given** a valid auth token, **When** the user requests their own profile, **Then** the response includes their id, name, email, and timestamps (no password).
2. **Given** no auth token or an expired/invalid token, **When** a request is made to the profile endpoint, **Then** the request is rejected with an unauthorised error.
3. **Given** a valid auth token for User A, **When** User A requests a profile by User B's id, **Then** the request is rejected with a forbidden or not-found error — User A cannot view other users' data.

---

### User Story 3 - Update Own Profile (Priority: P3)

An authenticated user updates one or more of their account fields: full name, email address,
or password.

**Why this priority**: Profile updates are a standard account-management capability needed
after registration, but the service delivers value without it initially.

**Independent Test**: Can be fully tested by registering, authenticating, and submitting an
update payload. Delivers the ability to correct or change account information.

**Acceptance Scenarios**:

1. **Given** a valid auth token and at least one valid field to change, **When** the user submits an update request, **Then** the updated fields are persisted and the response reflects the new profile state.
2. **Given** a valid auth token and a new email that already belongs to another account, **When** the user attempts the update, **Then** the request is rejected with a conflict error and no change is persisted.
3. **Given** no auth token or an invalid token, **When** an update request is made, **Then** the request is rejected with an unauthorised error.
4. **Given** a password change request, **When** a new password is provided, **Then** the new password is stored as a secure hash and the old password is no longer valid.

---

### User Story 4 - Delete Own Account (Priority: P4)

An authenticated user permanently removes their own account from the system.

**Why this priority**: Account deletion is required for data-rights compliance and user
autonomy, but it is the least frequent operation and does not block any other story.

**Independent Test**: Can be fully tested by registering, authenticating, and issuing a
delete request. Verification: the account no longer exists and subsequent lookups return
not-found.

**Acceptance Scenarios**:

1. **Given** a valid auth token, **When** the user requests deletion of their own account, **Then** the user record is permanently removed and the response confirms deletion.
2. **Given** no auth token or an invalid token, **When** a delete request is made, **Then** the request is rejected with an unauthorised error.
3. **Given** a deleted account's id, **When** any subsequent request is made referencing that id, **Then** a not-found response is returned.

---

### Edge Cases

- What happens when a registration request is submitted with extra/unknown fields? — Unknown fields are silently ignored; only defined fields are processed.
- What happens when an update request body is empty or contains no recognised fields? — The request is rejected with a validation error indicating at least one field must be provided.
- What happens when two concurrent registrations use the same email address simultaneously? — Only one succeeds; the second receives a conflict error. Uniqueness is enforced at the persistence layer.
- How does the service handle a profile retrieval for a user id that does not exist? — A not-found error is returned regardless of authentication state.
- What happens when an update would change email to the user's current email (no-op)? — The request succeeds; the record's last-updated timestamp is refreshed.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The service MUST allow any unauthenticated caller to register a new user account by providing a full name, email address, and password.
- **FR-002**: The service MUST reject registration requests where the email address is not in a valid format or is already associated with an existing account.
- **FR-003**: The service MUST store user passwords as a secure cryptographic hash; plaintext passwords MUST never be stored, returned in responses, or written to logs.
- **FR-004**: The service MUST allow an authenticated user to retrieve their own profile, returning id, name, email, and timestamps.
- **FR-005**: The service MUST allow an authenticated user to update their own profile fields (name, email, or password), validating all inputs before persisting changes.
- **FR-006**: The service MUST allow an authenticated user to permanently delete their own account.
- **FR-007**: The service MUST reject all GET, UPDATE, and DELETE requests that do not carry a valid, unexpired authentication token, responding with an unauthorised error.
- **FR-008**: The service MUST prevent any user from accessing or modifying another user's data; operations are scoped to the identity encoded in the auth token.
- **FR-009**: The service MUST return descriptive, user-friendly validation error messages for all malformed or missing inputs without exposing internal implementation details.
- **FR-010**: The service MUST emit a structured log entry for every request to a protected endpoint, recording the outcome (success or failure) for audit purposes.

### Key Entities

- **User**: Represents a registered person. Attributes: unique system-generated identifier, full name, email address (unique across all users), hashed password, account creation timestamp, last-updated timestamp. The password hash is an internal field and MUST NOT appear in any API response.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new user account can be registered in under 2 seconds under normal operating load.
- **SC-002**: Authenticated profile read and update operations complete in under 1 second under normal operating load.
- **SC-003**: 100% of requests to protected endpoints that lack a valid auth token are rejected before any business logic executes.
- **SC-004**: Duplicate email registrations are rejected 100% of the time, with zero duplicate records ever created.
- **SC-005**: The service sustains at least 500 concurrent users performing read and write operations without measurable degradation in response times.
- **SC-006**: No user password (plaintext or hash) appears in any API response or application log in 100% of cases.

## Assumptions

- Authentication token validation (signature verification, expiry check) is performed by inspecting the token against the Authentication Service's public key or shared secret; the User Service does not issue tokens.
- Users manage only their own accounts; there is no admin or super-user role in this version.
- Email address is the unique human-readable identifier for a user; username-based login is out of scope.
- Password reset ("forgot password") and email verification flows are out of scope for this version.
- Account deletion is permanent (hard delete); soft-delete or account deactivation is out of scope.
- The Authentication Service is a separate, independently deployed service; this spec covers only the User Service boundary.
- All requests arrive over HTTPS in non-local environments; the service itself does not handle TLS termination.
