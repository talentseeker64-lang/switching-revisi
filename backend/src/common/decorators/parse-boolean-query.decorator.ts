import { Transform } from 'class-transformer';

/**
 * `@Type(() => Boolean)` on a query-string DTO field is a common trap:
 * `Boolean("false")` is `true` in JS (any non-empty string is truthy), so
 * `?flag=false` silently becomes `true`. Use this instead for boolean query
 * params - it only matches the literal strings "true"/"false".
 */
export function ParseBooleanQuery() {
  return Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  });
}
