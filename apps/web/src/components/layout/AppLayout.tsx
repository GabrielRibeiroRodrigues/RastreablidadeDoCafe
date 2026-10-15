import { Outlet } from 'react-router';
import { AppHeader } from './AppHeader';
import { AppSidebar } from './AppSidebar';

export function AppLayout() {
  return (
    <div className="flex min-h-svh">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
