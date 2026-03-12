/// <reference types="vite/client" />
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router';
import { QueryClient } from '@tanstack/react-query';
import { ClerkProvider } from '@clerk/tanstack-react-start';

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    head: () => ({
      meta: [
        { charSet: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      ],
    }),
    component: RootComponent,
  }
);

function RootComponent() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body style={{ margin: 0 }}>
        <ClerkProvider publishableKey={PUBLISHABLE_KEY || 'pk_test_missing_key'} afterSignOutUrl="/">
          <Outlet />
        </ClerkProvider>
        <Scripts />
      </body>
    </html>
  );
}
