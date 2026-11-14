/* eslint-disable react-refresh/only-export-components -- a test stub exporting a hook and a provider together */
export const useAuth = () => ({ permissions: {}, currentUser: { email: 'rep@rb.test', rawRole: 'employee', role: 'employee', name: 'rep' } })
export const AuthProvider = ({ children }) => children
