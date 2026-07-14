# Implementation Plan: ShadowVault Frontend UI

## Overview

This plan implements the complete ShadowVault Next.js 14 frontend application for secure file sharing. The existing codebase already has scaffolded routes, a working API client with token refresh, basic hooks, and UI primitives. The tasks build incrementally on this foundation: starting with shared types/schemas, then auth infrastructure, followed by feature pages, and ending with admin capabilities and testing.

## Tasks

- [x] 1. Set up shared types, validation schemas, and testing infrastructure
  - [x] 1.1 Create shared TypeScript interfaces and types
    - Create `frontend/src/types/index.ts` with all interfaces from the design: `AuthUser`, `AuthContextValue`, `LoginParams`, `RegisterParams`, `AuthResult`, `FileDashboardItem`, `UploadFormData`, `UploadResponse`, `SharePageState`, `AuditEventType`, `AuditLogEntry`, `PaginatedResponse`, `AdminUser`, `AdminAuditFilters`
    - Create `frontend/src/types/api.ts` for API error types and response wrappers
    - _Requirements: 3.1, 6.2, 9.2, 10.4_

  - [x] 1.2 Create Zod validation schemas
    - Create `frontend/src/lib/schemas.ts` with `registerSchema`, `loginSchema`, `uploadSchema`, and `sharePasswordSchema` exactly matching the design document specifications
    - Ensure validation rules mirror backend constraints: email max 254 chars, username 3–30 alphanumeric/underscore, password 12–128 chars, file max 100 MB, expiry 60–2,592,000 seconds, maxDownloads -1 or ≥1
    - _Requirements: 1.2, 1.3, 1.4, 2.2, 7.12, 7.13, 13.1_

  - [x] 1.3 Create React Query key factory
    - Create `frontend/src/lib/queryKeys.ts` with the structured query key definitions from the design: `auth.me`, `files.all`, `files.list`, `files.detail(id)`, `audit.user(page, limit)`, `admin.users(page, limit)`, `admin.audit(page, filters)`
    - _Requirements: 6.1, 9.1, 10.3, 11.1_

  - [x] 1.4 Set up testing infrastructure
    - Install dev dependencies: `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `fast-check`, `msw`, `jsdom`
    - Create `frontend/vitest.config.ts` with jsdom environment and path aliases matching `tsconfig.json`
    - Create `frontend/src/__tests__/setup.ts` with testing-library jest-dom matchers
    - _Requirements: 13.1_

- [x] 2. Implement authentication context and protected routing
  - [x] 2.1 Refactor AuthProvider as a React context
    - Create `frontend/src/contexts/AuthContext.tsx` providing `AuthContextValue` via React Context
    - Use React Query (`useQuery` with key `auth.me`) for the `/auth/me` call instead of local state, with a 10-second timeout that treats no response as unauthenticated
    - Implement `login`, `register`, and `logout` mutations that invalidate the `auth.me` query on success
    - Wrap the provider in `providers.tsx` so the entire app tree has access
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

  - [x] 2.2 Implement ProtectedRoute and PublicRoute wrappers
    - Create `frontend/src/components/auth/ProtectedRoute.tsx` that reads auth context, shows a loading indicator while auth is pending (max 10 seconds), redirects to `/login` if unauthenticated, and stores the attempted path for post-login redirect
    - Create `frontend/src/components/auth/PublicRoute.tsx` that redirects authenticated users to `/dashboard`
    - Add optional `requireAdmin` prop to `ProtectedRoute` that redirects non-admin users to `/dashboard`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 10.1, 10.2_

  - [ ]* 2.3 Write property test for protected route redirect (Property 4)
    - **Property 4: Protected route redirect**
    - Test that for any route in the protected set, rendering with an unauthenticated context results in a redirect to `/login`
    - **Validates: Requirements 4.1**

- [x] 3. Implement navigation layout with responsive design
  - [x] 3.1 Refactor Navbar component with auth context integration
    - Update `frontend/src/components/layout/Navbar.tsx` to consume the `AuthContext` directly instead of receiving props
    - Display role-based links: Dashboard, Upload, Audit Log (all authenticated users), Admin (isAdmin only)
    - Show username (truncated to 20 chars with ellipsis if longer) and a functional logout button
    - When unauthenticated, show only Login and Register links
    - Apply active route highlighting using `usePathname()`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 3.2 Implement responsive mobile menu and accessibility
    - Collapse navigation to a toggleable mobile menu on viewports below 768px
    - Implement keyboard navigation with Tab key support and visible focus indicators
    - Add ARIA labels to all interactive elements: `aria-label` on menu toggle, `aria-current="page"` on active link, `role="navigation"` on nav element
    - _Requirements: 5.6, 5.7, 14.3, 14.4, 14.5_

  - [x] 3.3 Create AppShell layout component
    - Create `frontend/src/components/layout/AppShell.tsx` wrapping the Navbar + main content area
    - Update `frontend/src/app/layout.tsx` to include AuthProvider and AppShell in the provider hierarchy
    - Add a global React error boundary at the layout level with a fallback UI containing a "Reload" button
    - _Requirements: 5.1, 14.5_

  - [ ]* 3.4 Write property test for username display truncation (Property 5)
    - **Property 5: Username display truncation**
    - For any username string, verify the display shows full string if ≤20 chars, or first 20 + "…" if longer
    - **Validates: Requirements 5.3**

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement registration and login pages
  - [x] 5.1 Refactor registration page with full validation
    - Update `frontend/src/app/register/page.tsx` to use the shared `registerSchema` from `lib/schemas.ts`
    - Integrate `react-hook-form` with `zodResolver` and the `AuthContext` `register` method
    - Show inline validation errors on blur and submit for all fields (email, username, password)
    - Display loading indicator and disable submit during request
    - Display backend error messages below the form on failure
    - Redirect to dashboard on success
    - Wrap in `PublicRoute` to redirect already-authenticated users
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 13.1, 13.2, 13.3_

  - [x] 5.2 Refactor login page with full validation
    - Update `frontend/src/app/login/page.tsx` to use the shared `loginSchema` from `lib/schemas.ts`
    - Integrate with `AuthContext` `login` method
    - Preserve email field value on error, display connectivity error on network failure
    - Add link to registration page
    - Implement post-login redirect to the originally requested path (from ProtectedRoute)
    - Wrap in `PublicRoute`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 4.4_

  - [ ]* 5.3 Write property tests for registration and login schemas (Properties 1, 2)
    - **Property 1: Registration schema round-trip validation**
    - **Property 2: Login schema validation**
    - Use fast-check to generate random inputs and verify schema acceptance/rejection matches the specified rules
    - **Validates: Requirements 1.2, 1.3, 1.4, 2.2**

- [x] 6. Implement file dashboard with actions
  - [x] 6.1 Refactor dashboard page with auth context and actions
    - Update `frontend/src/app/dashboard/page.tsx` to wrap in `ProtectedRoute`
    - Integrate `useDeleteFile` and `useRevokeShareLink` mutations with optimistic UI updates
    - Display a confirmation dialog before delete operations
    - Show inline error messages on failed delete/revoke with the API error response
    - Display loading skeleton (at least 3 placeholder rows) while fetching
    - Show empty state with link to upload page when no files exist
    - _Requirements: 6.1, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9_

  - [x] 6.2 Implement share URL display and copy-to-clipboard
    - For each file with status "active" and non-empty shareToken, display the full share URL with a copy-to-clipboard button
    - Hide share URL for non-active files or empty shareTokens
    - Show download count with maxDownloads (display "Unlimited" when maxDownloads is -1)
    - Display file status as a distinct visual badge (active, expired, burned, deleted)
    - _Requirements: 6.2, 6.3, 6.10_

  - [x] 6.3 Create ConfirmDialog component
    - Create `frontend/src/components/ui/ConfirmDialog.tsx` with props: `title`, `message`, `onConfirm`, `onCancel`, `isOpen`
    - Implement focus trap within the dialog
    - Support closing via Escape key and return focus to the triggering element
    - Add ARIA attributes: `role="dialog"`, `aria-modal="true"`, `aria-labelledby`
    - _Requirements: 12.2, 14.6_

  - [ ]* 6.4 Write property tests for dashboard rendering (Properties 6, 7, 8)
    - **Property 6: File dashboard item rendering completeness**
    - **Property 7: Status badge distinctness**
    - **Property 8: Share URL conditional display**
    - **Validates: Requirements 6.2, 6.3, 6.10, 9.5**

- [x] 7. Implement file upload page with full validation
  - [x] 7.1 Refactor upload page with shared schema and form validation
    - Update `frontend/src/app/upload/page.tsx` to use the shared `uploadSchema` from `lib/schemas.ts` with `react-hook-form` and `zodResolver`
    - Add custom expiry duration option with min 60s / max 30 days validation
    - Add download-once toggle that disables and sets maxDownloads to 1 when enabled
    - Display validation errors inline adjacent to each field on blur and submit
    - Wrap in `ProtectedRoute`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.12, 7.13, 13.1, 13.2_

  - [x] 7.2 Implement upload submission and success state
    - Send multipart POST to `/api/files/upload` with all metadata fields
    - Display upload progress percentage during transfer
    - On success, display the generated share URL with copy-to-clipboard and reset form
    - On error, display the API error message adjacent to the form
    - Disable submit button during upload
    - _Requirements: 7.8, 7.9, 7.10, 7.11, 13.5, 13.6_

  - [ ]* 7.3 Write property test for upload schema validation (Property 3)
    - **Property 3: Upload schema validation**
    - Use fast-check to verify schema accepts only valid combinations: file ≤100MB, expiry 60–2,592,000, password ≤128, maxDownloads -1 or ≥1
    - **Validates: Requirements 7.12, 7.13, 7.5, 7.6**

- [x] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement share download page
  - [x] 9.1 Implement SharePage state machine
    - Update `frontend/src/app/share/[token]/page.tsx` with the full state machine: ready → password-required | downloading | success | error
    - On load, display download button (ready state)
    - On download click, send GET to `/api/share/:token` with optional `X-Share-Password` header
    - On `INVALID_SHARE_PASSWORD` response, transition to password-required state showing password input and submit button
    - Validate password field is non-empty before submission
    - On success, extract filename from `Content-Disposition` header, trigger browser file download, show success confirmation
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [x] 9.2 Implement share page error handling
    - For terminal errors (LINK_EXPIRED, TOKEN_REVOKED, FILE_BURNED, DOWNLOAD_LIMIT_REACHED, TOKEN_NOT_FOUND): display specific error message, no retry button
    - For non-terminal errors (network failure, unexpected server error): display error message with retry button
    - Show loading indicator and disable buttons during requests
    - _Requirements: 8.7, 8.8, 8.9_

  - [ ]* 9.3 Write property test for terminal share error classification (Property 9)
    - **Property 9: Terminal share error classification**
    - For any error code in the terminal set, verify no retry button is rendered; for non-terminal errors, verify retry button is present
    - **Validates: Requirements 8.7, 8.8**

- [x] 10. Implement audit log viewer
  - [x] 10.1 Implement AuditPage with pagination
    - Update `frontend/src/app/audit/page.tsx` to wrap in `ProtectedRoute`
    - Fetch audit logs via GET `/api/audit` with `page` and `limit` query params using React Query
    - Display each entry with: event type badge, file name (or "N/A" placeholder), locale-formatted timestamp, IP address, user agent
    - Display entries in reverse chronological order (newest first)
    - Implement pagination controls with current page, total pages, next/previous buttons (disabled at boundaries)
    - Show loading skeleton while fetching, error with retry on failure, empty state message when no entries
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8_

  - [x] 10.2 Create EventBadge component
    - Create `frontend/src/components/ui/EventBadge.tsx` rendering visually distinct badges for each `AuditEventType`: UPLOAD, DOWNLOAD, DELETE, BURN, EXPIRE, FAIL_ATTEMPT, LOGIN, LOGOUT, PASSWORD_RESET, LINK_CREATED, LINK_REVOKED
    - Each event type must have a unique color/class combination distinct from all others
    - _Requirements: 9.5_

  - [ ]* 10.3 Write property tests for audit log rendering (Properties 7, 10)
    - **Property 7: Status and event badge distinctness** (event type portion)
    - **Property 10: Audit log entry rendering completeness**
    - **Validates: Requirements 9.2, 9.5, 11.4**

- [x] 11. Implement admin panel
  - [x] 11.1 Implement Admin User Management tab
    - Update `frontend/src/app/admin/page.tsx` to wrap in `ProtectedRoute` with `requireAdmin`
    - Create a tabbed interface with: Users, Audit Logs, File Management tabs
    - Fetch user list from GET `/api/admin/users` with pagination
    - Display each user in a table row: email, username, role badge (Admin/User based on isAdmin), creation date, last login (or "Never")
    - Implement pagination controls (Previous/Next) disabled at boundaries
    - Show loading indicator while fetching, error message on failure
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

  - [x] 11.2 Implement Admin Audit Logs tab with filters
    - Fetch admin audit logs from GET `/api/admin/audit` with pagination and filter query params
    - Implement filter controls: event type dropdown, user ID text input, file ID text input, start date picker, end date picker
    - On filter apply, re-fetch with filter values and reset to page 1
    - Display each entry with: event type badge, user ID, file ID, IP address, locale-formatted timestamp, metadata as key-value pairs
    - Pagination with current page, total entries, and navigation
    - Loading skeleton, error with retry, and empty state for no matching results
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8_

  - [x] 11.3 Implement Admin File Management tab
    - Display files with delete button per entry
    - On delete click, show ConfirmDialog identifying the target file by name
    - On confirm, send DELETE to `/api/admin/files/:fileId`
    - On success, remove entry from list and show success notification for 5 seconds
    - On failure (including 404), show error notification and keep entry unchanged
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_

  - [ ]* 11.4 Write property test for admin user row rendering (Property 11)
    - **Property 11: Admin user row rendering completeness**
    - For any valid AdminUser object, verify the rendered row contains email, username, role badge, creation date, and last login (or "Never")
    - **Validates: Requirements 10.4**

- [x] 12. Implement form error handling and accessibility polish
  - [x] 12.1 Implement toast notification system
    - Create `frontend/src/components/ui/Toast.tsx` with auto-dismiss (5+ seconds) and manual dismiss
    - Create a ToastProvider context that exposes `showToast(message, type)` for success/error/info notifications
    - Integrate toast notifications for backend error responses (4xx/5xx) and network errors across all forms
    - Preserve form data on network timeout (30 seconds)
    - _Requirements: 13.4, 13.5, 13.6_

  - [x] 12.2 Implement global accessibility compliance
    - Audit all pages for semantic HTML elements (nav, main, header, footer, button, form)
    - Add ARIA landmarks on all major page regions
    - Ensure all interactive elements without visible text labels have `aria-label`
    - Verify Tab key navigation order is logical across all pages
    - Ensure focus indicators have minimum 3:1 contrast ratio
    - Verify the application renders without horizontal overflow on viewports 320px–2560px
    - _Requirements: 14.1, 14.2, 14.4, 14.5_

  - [ ]* 12.3 Write property test for form error clearance (Property 12)
    - **Property 12: Form error clearance on correction**
    - For any form field displaying a validation error, verify the error is removed when the field is corrected and blurred
    - **Validates: Requirements 13.3**

- [x] 13. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The existing scaffolding (API client, hooks, page stubs, UI primitives) is preserved and extended rather than rewritten
- All code uses TypeScript with strict typing matching the design interfaces
- The existing `api.ts` token refresh interceptor is kept as-is; the AuthContext wraps around it

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4"] },
    { "id": 1, "tasks": ["2.1", "3.3"] },
    { "id": 2, "tasks": ["2.2", "3.1", "3.2"] },
    { "id": 3, "tasks": ["2.3", "3.4", "5.1", "5.2"] },
    { "id": 4, "tasks": ["5.3", "6.1", "6.3", "7.1"] },
    { "id": 5, "tasks": ["6.2", "6.4", "7.2", "9.1"] },
    { "id": 6, "tasks": ["7.3", "9.2", "10.1", "10.2"] },
    { "id": 7, "tasks": ["9.3", "10.3", "11.1"] },
    { "id": 8, "tasks": ["11.2", "11.3", "11.4"] },
    { "id": 9, "tasks": ["12.1", "12.2"] },
    { "id": 10, "tasks": ["12.3"] }
  ]
}
```
