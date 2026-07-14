# Requirements Document

## Introduction

This document defines the requirements for the ShadowVault frontend user interface — a complete Next.js 14 application that provides secure one-time and time-limited encrypted file sharing. The frontend communicates with an existing backend API, offering user registration, authentication, file upload with encryption options, share link generation, file download for recipients, audit log viewing, and admin capabilities.

## Glossary

- **Frontend**: The Next.js 14 client application that renders the ShadowVault user interface in the browser
- **Auth_Module**: The frontend authentication state management layer responsible for login, registration, logout, session persistence, and token refresh
- **Dashboard**: The authenticated user's main view displaying their uploaded files and file status
- **Upload_Form**: The form component for uploading files with encryption options including expiry, download limits, and password protection
- **Share_Page**: The public-facing page that recipients use to download a shared file via a share token
- **Audit_Viewer**: The page displaying security-relevant events for the authenticated user
- **Admin_Panel**: The restricted interface accessible only to admin users for managing users and viewing system-wide audit logs
- **Navigation**: The persistent layout component providing site navigation, user status, and route links
- **Protected_Route**: A route wrapper that redirects unauthenticated users to the login page
- **API_Client**: The configured axios instance handling HTTP requests, credentials, and automatic token refresh

## Requirements

### Requirement 1: User Registration

**User Story:** As a new user, I want to create an account with my email, username, and password, so that I can securely upload and share files.

#### Acceptance Criteria

1. THE Frontend SHALL display a registration page at the `/register` route with required input fields for email, username, and password
2. WHEN a user submits the registration form, THE Frontend SHALL validate that the email field contains a valid email format with a maximum of 254 characters
3. WHEN a user submits the registration form, THE Frontend SHALL validate that the username is between 3 and 30 characters and contains only alphanumeric characters and underscores
4. WHEN a user submits the registration form, THE Frontend SHALL validate that the password is between 12 and 128 characters long
5. WHEN validation passes, THE Frontend SHALL send a POST request to `/api/auth/register` with email, username, and password fields
6. WHEN the backend returns a 201 response, THE Auth_Module SHALL update the authenticated state and redirect the user to the Dashboard
7. IF the backend returns a 4xx or 5xx error response, THEN THE Frontend SHALL display the error message from the API response body below the form
8. WHILE the registration request is in progress, THE Frontend SHALL display a loading indicator and disable the submit button
9. IF any required field is empty upon form submission, THEN THE Frontend SHALL display a validation error message adjacent to each empty field without sending an API request

### Requirement 2: User Login

**User Story:** As a registered user, I want to log in with my email and password, so that I can access my files and account features.

#### Acceptance Criteria

1. THE Frontend SHALL display a login page at the `/login` route with input fields for email and password
2. WHEN a user submits the login form, THE Frontend SHALL validate that the email is a valid email format with a maximum of 254 characters, and that the password is not empty
3. WHEN validation passes, THE Frontend SHALL send a POST request to `/api/auth/login` with email and password fields
4. WHEN the backend returns a 200 response, THE Auth_Module SHALL update the authenticated state and redirect the user to the Dashboard
5. IF the backend returns an error response, THEN THE Frontend SHALL display the error message from the API response below the form, preserving any user-entered email value in the input field
6. IF a network error occurs during the login request (no response from server), THEN THE Frontend SHALL display a connectivity error message below the form
7. WHILE the login request is in progress, THE Frontend SHALL display a loading indicator and disable the submit button
8. THE Frontend SHALL display a link to the registration page for users without an account

### Requirement 3: Authentication State Management

**User Story:** As an authenticated user, I want my session to persist across page reloads and automatically refresh, so that I do not need to log in repeatedly.

#### Acceptance Criteria

1. WHEN the application loads, THE Auth_Module SHALL call GET `/api/auth/me` to determine the current authentication state within 10 seconds, and if no response is received within that time, THE Auth_Module SHALL treat the user as unauthenticated
2. WHILE the authentication state is being determined, THE Frontend SHALL display a loading indicator instead of page content and SHALL NOT redirect the user to the login page
3. WHEN a 401 response is received from any API call, THE API_Client SHALL attempt to refresh the token by calling POST `/api/auth/refresh` exactly once per failed request
4. IF multiple API calls receive 401 responses concurrently, THEN THE API_Client SHALL issue only one refresh request and queue the other failed requests until the refresh completes, then retry all queued requests
5. IF the token refresh succeeds, THEN THE API_Client SHALL retry the original failed request exactly once
6. IF the token refresh fails, THEN THE Auth_Module SHALL clear the authenticated state and redirect the user to the login page
7. WHEN the user clicks the logout button, THE Auth_Module SHALL call POST `/api/auth/logout`, clear the authenticated state, and redirect to the login page regardless of whether the API call succeeds or fails
8. IF a request has already been retried after a token refresh, THEN THE API_Client SHALL reject the request with the error response without attempting another refresh

### Requirement 4: Protected Routes

**User Story:** As a platform owner, I want unauthenticated users to be redirected away from protected pages, so that sensitive data is not exposed.

#### Acceptance Criteria

1. WHEN an unauthenticated user attempts to access a Dashboard, Upload_Form, Audit_Viewer, or Admin_Panel route, THE Protected_Route SHALL redirect the user to the `/login` page
2. WHILE the Auth_Module is determining authentication state, THE Protected_Route SHALL display a loading indicator instead of rendering the protected page content or redirecting, for a maximum duration of 10 seconds before treating the state as unauthenticated
3. WHEN an authenticated user navigates to `/login` or `/register`, THE Frontend SHALL redirect the user to the Dashboard
4. WHEN an unauthenticated user is redirected to `/login` from a protected route, THE Frontend SHALL preserve the originally requested path and redirect the user back to that path upon successful login

### Requirement 5: Navigation Layout

**User Story:** As an authenticated user, I want a consistent navigation bar, so that I can easily move between sections of the application.

#### Acceptance Criteria

1. WHILE the user is authenticated, THE Navigation SHALL display links to Dashboard, Upload, and Audit Log pages
2. IF the authenticated user has the `isAdmin` property set to true, THEN THE Navigation SHALL additionally display a link to the Admin_Panel page
3. WHILE the user is authenticated, THE Navigation SHALL display the user's username (truncated to 20 characters with an ellipsis if longer) and a logout button
4. WHILE the user is not authenticated, THE Navigation SHALL display links to Login and Register pages only
5. THE Navigation SHALL apply a visually distinct style (such as a highlighted background, underline, or contrasting color) to the link corresponding to the currently active route, differentiating it from inactive links
6. THE Navigation SHALL collapse to a toggleable mobile menu on viewports below 768px, and display all links inline on viewports at or above 768px
7. THE Navigation SHALL support keyboard navigation and include appropriate ARIA labels for all interactive elements

### Requirement 6: File Dashboard

**User Story:** As an authenticated user, I want to see a list of all my uploaded files with their status, so that I can manage my shared files.

#### Acceptance Criteria

1. WHEN the Dashboard page loads, THE Frontend SHALL fetch the user's files by calling GET `/api/files` and display the results sorted by most recent first
2. THE Dashboard SHALL display each file with its original filename, expiry date, download count, max downloads (or "unlimited" when max downloads is -1), and status
3. THE Dashboard SHALL indicate the file status as one of: active, expired, burned, or deleted, using a distinct visual badge for each status
4. WHEN the user clicks the delete button on a file, THE Frontend SHALL send a DELETE request to `/api/files/:fileId` and remove the file from the displayed list upon a successful response
5. IF the delete request fails, THEN THE Frontend SHALL display an error message from the API response and leave the file list unchanged
6. WHEN the user clicks the revoke link button on an active file, THE Frontend SHALL send a POST request to `/api/files/:fileId/revoke` and update the file's share URL to no longer be displayed upon a successful response
7. IF the revoke request fails, THEN THE Frontend SHALL display an error message from the API response and leave the file entry unchanged
8. IF the file list is empty, THEN THE Dashboard SHALL display a message indicating no files have been uploaded with a link to the upload page
9. WHILE the file list is loading, THE Dashboard SHALL display a loading skeleton with at least 3 placeholder rows
10. THE Dashboard SHALL display the share URL for each file with an active status and a non-empty share token, alongside a copy-to-clipboard button that copies the full share URL to the user's clipboard

### Requirement 7: File Upload

**User Story:** As an authenticated user, I want to upload a file with encryption options, so that I can share it securely with time and download restrictions.

#### Acceptance Criteria

1. THE Upload_Form SHALL accept a single file via drag-and-drop or file picker with a maximum size of 100 MB
2. THE Upload_Form SHALL provide expiry duration options of 5 minutes, 30 minutes, 1 hour, 24 hours, 7 days, or a custom duration with a minimum of 60 seconds and a maximum of 30 days
3. THE Upload_Form SHALL provide a toggle for download-once mode that sets max downloads to 1 and auto-deletes the file after that single download
4. THE Upload_Form SHALL provide a toggle for burn-after-reading mode that removes the file content from the server immediately after the first recipient views/downloads it, displaying only a one-time render with no re-access
5. THE Upload_Form SHALL provide an optional password field for link protection with a maximum length of 128 characters
6. THE Upload_Form SHALL provide an optional max downloads field accepting an integer value of 1 or greater, or an explicit "unlimited" option that sends -1 to the backend
7. IF download-once mode is enabled, THEN THE Upload_Form SHALL disable the max downloads field and set its value to 1
8. WHEN the user submits a valid upload, THE Frontend SHALL send a multipart POST request to `/api/files/upload` with the file and metadata fields: expiresInSeconds, downloadOnce, burnAfterReading, password, and maxDownloads
9. WHEN the backend returns a 201 response, THE Frontend SHALL display the generated share URL with a copy-to-clipboard button and reset the Upload_Form to its default state
10. IF the backend returns an error response, THEN THE Frontend SHALL display the error message from the API response adjacent to the Upload_Form
11. WHILE the upload is in progress, THE Frontend SHALL display a progress indicator showing upload percentage and disable the submit button
12. IF the selected file exceeds 100 MB, THEN THE Upload_Form SHALL display a validation error adjacent to the file input before submission
13. IF the custom expiry duration is less than 60 seconds or greater than 30 days, THEN THE Upload_Form SHALL display a validation error adjacent to the expiry field before submission

### Requirement 8: Share Link Download Page

**User Story:** As a file recipient, I want to access a shared file via a share link, so that I can download the decrypted file.

#### Acceptance Criteria

1. THE Share_Page SHALL be accessible at `/share/:token` without authentication
2. WHEN the Share_Page loads, THE Frontend SHALL display a download prompt indicating a file is available and a download button
3. WHEN the user clicks download, THE Frontend SHALL send a GET request to `/api/share/:token` with the password in the `X-Share-Password` header if a password has been provided
4. IF the backend returns an INVALID_SHARE_PASSWORD error on the download attempt, THEN THE Share_Page SHALL transition to a password-required state displaying a password input field and a submit button to retry the download with the entered password
5. IF the user submits the password form with an empty password field, THEN THE Share_Page SHALL display a validation error indicating the password is required without sending a request
6. WHEN the backend returns a 200 response with file data, THE Frontend SHALL extract the filename from the Content-Disposition response header, trigger a browser file download with the extracted filename, and transition to a success state confirming the download is complete
7. IF the backend returns a terminal error (LINK_EXPIRED, TOKEN_REVOKED, FILE_BURNED, DOWNLOAD_LIMIT_REACHED, or TOKEN_NOT_FOUND), THEN THE Share_Page SHALL display an error message identifying the specific reason and SHALL NOT offer a retry option
8. IF the backend returns a non-terminal error (network failure or unexpected server error), THEN THE Share_Page SHALL display an error message and provide a retry button to attempt the download again
9. WHILE the download request is in progress, THE Share_Page SHALL display a loading indicator and disable the download or submit button

### Requirement 9: Audit Log Viewer

**User Story:** As an authenticated user, I want to view my security audit logs, so that I can monitor access and actions on my files.

#### Acceptance Criteria

1. WHEN the Audit_Viewer page loads, THE Frontend SHALL fetch audit logs by calling GET `/api/audit` with query parameters `page` (default 1) and `limit` (default 50, maximum 200)
2. THE Audit_Viewer SHALL display each log entry showing the event type, associated file name (or a placeholder label when no file is associated), timestamp formatted to the user's locale, IP address, and user agent
3. THE Audit_Viewer SHALL display log entries in reverse chronological order (newest first), matching the API response order
4. THE Audit_Viewer SHALL provide pagination controls that display the current page number and total pages, and allow navigating to the next and previous pages, with navigation disabled when on the first or last page respectively
5. THE Audit_Viewer SHALL display event types with visually distinct badges for each type: UPLOAD, DOWNLOAD, DELETE, BURN, EXPIRE, FAIL_ATTEMPT, LOGIN, LOGOUT, PASSWORD_RESET, LINK_CREATED, and LINK_REVOKED
6. WHILE audit logs are loading, THE Audit_Viewer SHALL display a loading skeleton in place of the log entries
7. IF the audit log API request fails, THEN THE Audit_Viewer SHALL display an error message indicating the logs could not be loaded and provide a retry action
8. IF the API returns zero audit log entries, THEN THE Audit_Viewer SHALL display an empty state message indicating no security events have been recorded

### Requirement 10: Admin Panel — User Management

**User Story:** As an admin, I want to view and manage all registered users, so that I can oversee the platform.

#### Acceptance Criteria

1. THE Admin_Panel SHALL only be accessible to users where the `isAdmin` property is true
2. IF a non-admin user navigates to the Admin_Panel route, THEN THE Frontend SHALL redirect the user to the Dashboard
3. WHEN the Admin_Panel loads, THE Frontend SHALL fetch the user list by calling GET `/api/admin/users` with pagination query parameters `page` (default: 1) and `limit` (default: 50, maximum: 200)
4. THE Admin_Panel SHALL display each user in a tabular row showing their email, username, admin status (displayed as a role badge distinguishing "Admin" from "User"), creation date, and last login date (displaying "Never" when the user has not logged in)
5. THE Admin_Panel SHALL provide pagination controls including a "Previous" button (disabled on the first page) and a "Next" button (disabled when fewer results than the page limit are returned) to navigate through the user list
6. WHILE the Admin_Panel is fetching user data, THE Frontend SHALL display a loading indicator in place of the user table
7. IF the GET `/api/admin/users` request fails, THEN THE Frontend SHALL display an error message indicating the user list could not be loaded

### Requirement 11: Admin Panel — Audit Logs

**User Story:** As an admin, I want to view all system audit logs with filtering capabilities, so that I can investigate security events.

#### Acceptance Criteria

1. WHEN the admin navigates to the audit logs tab, THE Admin_Panel SHALL fetch the first page of audit logs from GET `/api/admin/audit` with default pagination parameters (page 1, limit 50)
2. THE Admin_Panel audit tab SHALL provide filter controls for event type (dropdown with options: UPLOAD, DOWNLOAD, EXPIRE, DELETE, BURN, FAIL_ATTEMPT, LOGIN, LOGOUT, PASSWORD_RESET, LINK_CREATED, LINK_REVOKED), user ID (text input), file ID (text input), start date (date picker, ISO 8601 format), and end date (date picker, ISO 8601 format)
3. WHEN the admin activates the filter apply action, THE Frontend SHALL re-fetch audit logs from GET `/api/admin/audit` with the selected filter values as query parameters and reset pagination to page 1
4. THE Admin_Panel audit tab SHALL display each log entry with event type (as a distinct visual badge), user ID, file ID, IP address, timestamp formatted as a human-readable date and time, and metadata displayed as key-value pairs
5. THE Admin_Panel audit tab SHALL provide pagination controls displaying the current page, total number of entries, and navigation to move between pages with a fixed page size of 50 entries
6. WHILE audit logs are being fetched, THE Admin_Panel audit tab SHALL display a loading skeleton in place of the log table
7. IF the audit logs API request fails, THEN THE Admin_Panel audit tab SHALL display an error message indicating the logs could not be loaded and provide a retry action
8. IF no audit log entries match the current filters, THEN THE Admin_Panel audit tab SHALL display a message indicating no results were found for the selected filters

### Requirement 12: Admin Panel — File Management

**User Story:** As an admin, I want to force-delete files from the system, so that I can remove abusive or problematic content.

#### Acceptance Criteria

1. WHEN the admin sends a DELETE request to `/api/admin/files/:fileId` for an existing file, THE Admin_Panel SHALL permanently delete the file (including encrypted data on disk and all associated database records) and return a success response containing the deleted file's identifier
2. WHEN the admin clicks the delete button for a file, THE Frontend SHALL display a confirmation dialog that identifies the target file by name and presents explicit "Confirm" and "Cancel" actions before proceeding with the deletion request
3. WHEN the backend returns a success response for the deletion, THE Frontend SHALL remove the file entry from the displayed list and show a success notification for 5 seconds
4. IF the admin sends a DELETE request with a fileId that does not exist or has already been deleted, THEN THE Admin_Panel SHALL return a 404 error response indicating the file was not found and SHALL NOT modify any data
5. WHEN an admin force-delete operation completes successfully, THE Admin_Panel SHALL record an audit log entry capturing the admin's user ID, the deleted file's ID, and a timestamp
6. IF the backend returns an error response for the deletion request, THEN THE Frontend SHALL keep the file entry in the displayed list unchanged and show an error notification indicating the deletion failed

### Requirement 13: Form Validation and Error Handling

**User Story:** As a user, I want immediate feedback on form errors, so that I can correct mistakes before submission.

#### Acceptance Criteria

1. THE Frontend SHALL validate all form inputs on blur and on submit using Zod schemas matching the backend validation rules for registration (email max 254 characters, username 3–30 alphanumeric/underscore characters, password minimum 12 characters), login (valid email format, non-empty password), and file upload (expiry 60–2,592,000 seconds, maxDownloads minimum 1 or unlimited, file size maximum 100 MB)
2. WHEN a validation error occurs, THE Frontend SHALL display the error message adjacent to the relevant input field within 200 milliseconds of the blur or submit event, and SHALL display errors for all invalid fields simultaneously
3. WHEN the user corrects a field that previously had a validation error, THE Frontend SHALL remove the corresponding error message on the next blur or input event for that field
4. WHEN the backend returns an error response (status 4xx or 5xx), THE Frontend SHALL display the error message from the response body as a toast notification that remains visible for at least 5 seconds or as an inline message below the relevant form, including the error description provided by the API
5. IF a network error occurs (no response received from the server within 30 seconds), THEN THE Frontend SHALL display a connectivity error message indicating the server is unreachable and SHALL preserve all user-entered form data so the user can retry without re-entering information
6. WHILE a form submission request is in progress, THE Frontend SHALL disable the submit button and preserve all field values until a response or timeout is received

### Requirement 14: Responsive Design and Accessibility

**User Story:** As a user, I want the application to work on all device sizes and be accessible via keyboard, so that I can use the platform regardless of my device or abilities.

#### Acceptance Criteria

1. THE Frontend SHALL render all page content without horizontal overflow and with all interactive elements reachable on viewport widths from 320px to 2560px
2. THE Frontend SHALL use a dark theme with dark backgrounds and accent colors for interactive elements
3. WHILE the viewport width is below 768px, THE Navigation SHALL collapse into a mobile menu that provides access to all navigation links available in the desktop layout
4. THE Frontend SHALL support full keyboard navigation where all interactive elements are reachable via the Tab key in a logical reading order, with focus indicators that have a minimum contrast ratio of 3:1 against adjacent colors
5. THE Frontend SHALL use semantic HTML elements (nav, main, header, footer, button, form) and provide ARIA labels on all interactive elements that lack visible text labels, and ARIA landmarks on all major page regions
6. WHEN a modal or dialog is opened, THE Frontend SHALL trap keyboard focus within the dialog and return focus to the triggering element when the dialog is closed via the Escape key or a close action
