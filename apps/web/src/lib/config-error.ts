// A startup problem an operator must fix (missing Firebase config, for example).
// The error boundary shows these in full even in production, unlike other errors.
export class ConfigurationError extends Error {
  override readonly name = 'ConfigurationError';
}
