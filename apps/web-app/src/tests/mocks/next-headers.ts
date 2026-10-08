// Stand-in for next/headers, aliased in vitest.config.ts.
// Exposes a shared cookie jar AND authorization header store so tests can
// simulate both browser (cookie) and native (Bearer) authentication.

export const cookieStore = new Map<string, string>();
export const headerStore = new Map<string, string>();

type SetArgs = [string, string] | [{ name: string; value: string }];

export async function cookies() {
  return {
    get(name: string) {
      const value = cookieStore.get(name);
      return value === undefined ? undefined : { name, value };
    },
    getAll() {
      return [...cookieStore.entries()].map(([name, value]) => ({ name, value }));
    },
    set(...args: SetArgs) {
      let name: string;
      let value: string;
      if (typeof args[0] === 'string') {
        name = args[0];
        value = args[1]!; // positional-form callers always supply a value at index 1
      } else {
        name = args[0].name;
        value = args[0].value;
      }
      cookieStore.set(name, value);
      return { name, value };
    },
    delete(name: string) {
      cookieStore.delete(name);
    },
  };
}

export async function headers() {
  return {
    get(name: string) {
      return headerStore.get(name.toLowerCase());
    },
    set(name: string, value: string) {
      headerStore.set(name.toLowerCase(), value);
    },
    delete(name: string) {
      headerStore.delete(name.toLowerCase());
    },
  };
}
