import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { Layout } from './components/Layout';

// Immediate load for Landing & Login
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';

// Lazy loaded portal pages
const DashboardPage = lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const CharacterPage = lazy(() => import('./pages/CharacterPage').then(m => ({ default: m.CharacterPage })));
const InventoryPage = lazy(() => import('./pages/InventoryPage').then(m => ({ default: m.InventoryPage })));
const ApplicationsPage = lazy(() => import('./pages/ApplicationsPage').then(m => ({ default: m.ApplicationsPage })));
const ApplicationDetailPage = lazy(() => import('./pages/ApplicationDetailPage').then(m => ({ default: m.ApplicationDetailPage })));
const WikiHomePage = lazy(() => import('./pages/WikiHomePage').then(m => ({ default: m.WikiHomePage })));
const WikiCategoryPage = lazy(() => import('./pages/WikiCategoryPage').then(m => ({ default: m.WikiCategoryPage })));
const WikiArticlePage = lazy(() => import('./pages/WikiArticlePage').then(m => ({ default: m.WikiArticlePage })));
const SearchPage = lazy(() => import('./pages/SearchPage').then(m => ({ default: m.SearchPage })));

// Lazy loaded admin management pages
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout').then(m => ({ default: m.AdminLayout })));
const AdminOverviewPage = lazy(() => import('./pages/admin/AdminOverviewPage').then(m => ({ default: m.AdminOverviewPage })));
const AdminWikiPage = lazy(() => import('./pages/admin/AdminWikiPage').then(m => ({ default: m.AdminWikiPage })));
const AdminWikiEditorPage = lazy(() => import('./pages/admin/AdminWikiEditorPage').then(m => ({ default: m.AdminWikiEditorPage })));
const AdminApplicationsPage = lazy(() => import('./pages/admin/AdminApplicationsPage').then(m => ({ default: m.AdminApplicationsPage })));
const AdminApplicationEditorPage = lazy(() => import('./pages/admin/AdminApplicationEditorPage').then(m => ({ default: m.AdminApplicationEditorPage })));
const AdminCharactersPage = lazy(() => import('./pages/admin/AdminCharactersPage').then(m => ({ default: m.AdminCharactersPage })));
const AdminAuditPage = lazy(() => import('./pages/admin/AdminAuditPage').then(m => ({ default: m.AdminAuditPage })));

function RouteLoadingFallback() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
      <div className="spinner" style={{ width: '32px', height: '32px' }} />
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              {/* Public & Player Portal Routes */}
              <Route path="/" element={<HomePage />} />
              <Route path="/login" element={<LoginPage />} />
              
              <Route path="/dashboard" element={<Suspense fallback={<RouteLoadingFallback />}><DashboardPage /></Suspense>} />
              <Route path="/profile" element={<Suspense fallback={<RouteLoadingFallback />}><CharacterPage /></Suspense>} />
              <Route path="/characters/:id" element={<Suspense fallback={<RouteLoadingFallback />}><CharacterPage /></Suspense>} />
              <Route path="/inventory" element={<Suspense fallback={<RouteLoadingFallback />}><InventoryPage /></Suspense>} />
              <Route path="/characters/:id/inventory" element={<Suspense fallback={<RouteLoadingFallback />}><InventoryPage /></Suspense>} />
              <Route path="/applications" element={<Suspense fallback={<RouteLoadingFallback />}><ApplicationsPage /></Suspense>} />
              <Route path="/applications/:slug" element={<Suspense fallback={<RouteLoadingFallback />}><ApplicationDetailPage /></Suspense>} />
              <Route path="/wiki" element={<Suspense fallback={<RouteLoadingFallback />}><WikiHomePage /></Suspense>} />
              <Route path="/wiki/:category" element={<Suspense fallback={<RouteLoadingFallback />}><WikiCategoryPage /></Suspense>} />
              <Route path="/wiki/:category/:slug" element={<Suspense fallback={<RouteLoadingFallback />}><WikiArticlePage /></Suspense>} />
              <Route path="/wiki/articles/:slug" element={<Suspense fallback={<RouteLoadingFallback />}><WikiArticlePage /></Suspense>} />
              <Route path="/search" element={<Suspense fallback={<RouteLoadingFallback />}><SearchPage /></Suspense>} />

              {/* Admin Management Terminal Routes */}
              <Route path="/admin" element={<Suspense fallback={<RouteLoadingFallback />}><AdminLayout /></Suspense>}>
                <Route index element={<Suspense fallback={<RouteLoadingFallback />}><AdminOverviewPage /></Suspense>} />
                <Route path="wiki" element={<Suspense fallback={<RouteLoadingFallback />}><AdminWikiPage /></Suspense>} />
                <Route path="wiki/new" element={<Suspense fallback={<RouteLoadingFallback />}><AdminWikiEditorPage /></Suspense>} />
                <Route path="wiki/edit/:slug" element={<Suspense fallback={<RouteLoadingFallback />}><AdminWikiEditorPage /></Suspense>} />
                <Route path="applications" element={<Suspense fallback={<RouteLoadingFallback />}><AdminApplicationsPage /></Suspense>} />
                <Route path="applications/new" element={<Suspense fallback={<RouteLoadingFallback />}><AdminApplicationEditorPage /></Suspense>} />
                <Route path="applications/edit/:slug" element={<Suspense fallback={<RouteLoadingFallback />}><AdminApplicationEditorPage /></Suspense>} />
                <Route path="characters" element={<Suspense fallback={<RouteLoadingFallback />}><AdminCharactersPage /></Suspense>} />
                <Route path="audit" element={<Suspense fallback={<RouteLoadingFallback />}><AdminAuditPage /></Suspense>} />
              </Route>

              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
