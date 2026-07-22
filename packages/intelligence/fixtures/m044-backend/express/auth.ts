export function requireAuth(req: unknown, _res: unknown, next: () => void) {
  void req;
  next();
}
