import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar';
import { Footer } from './Footer';
import { SearchOverlay } from './search/SearchOverlay';
import { MascotWidget } from './common/MascotWidget';

export function Layout() {
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Global Ctrl+K / Cmd+K keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchOpen(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="app-container">
      <Navbar onOpenSearch={() => setIsSearchOpen(true)} />
      <main className="main-content">
        <Outlet />
      </main>
      <Footer />
      
      {/* Global Interactive Anime Mascot Widget */}
      <MascotWidget />

      {/* Global Search Dialog Modal */}
      <SearchOverlay 
        isOpen={isSearchOpen} 
        onClose={() => setIsSearchOpen(false)} 
      />
    </div>
  );
}
