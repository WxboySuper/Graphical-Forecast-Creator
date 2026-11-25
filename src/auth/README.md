# Hosted authentication

`src/auth` owns the client-side hosted authentication provider, the shared
`AuthBackend` contract, and Firebase/Clerk identity adapters. Application
services use this boundary for backend selection, identity tokens, and the
Clerk beta API.

Keep hosted credentials and provider-specific behavior inside auth adapters.
`AuthProvider` owns app session state and chooses the adapter selected by the
build configuration. Auth does not own billing, forecast state, or server
authorization decisions. Update hosted and local auth fixtures when the
identity contract changes.
