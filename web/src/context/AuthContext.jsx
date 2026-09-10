import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

const DEMO_CHARACTERS = {
  activeSlot: 1,
  hasCharacters: true,
  slot1: {
    id: "char_demo_01",
    character_name: "Хана Ками",
    character_avatar: "/assets/character/hero_portrait.png",
    slot: 1,
    is_owner: true,
    organization: "TENRYU",
    rank: "Ранг S",
    attribute_name: "Багровое Пламя",
    reputation: 1450,
    reputation_tier: { name: "Герой Эшелона S", key: "s_tier" },
    ap: 850,
    ap_multiplier: 120,
    sp_multiplier: 110,
    total_sp: 1850,
    krw: 4500000,
    yen: 820000,
    salary_multiplier: 115,
    weekly_salary: { amount: 150000, currency: "yen" },
    physical_stats: {
      is_registered: true,
      punch_kg: 12500,
      durability_kg: 37500,
      lifting_kg: 18000,
      speed_kmh: 320,
      reaction_s: 0.04
    },
    styles: [
      { id: "style_1", name: "Танец Багрового Феникса", rank_name: "Мастер", sp: 1850 },
      { id: "style_2", name: "Концентрация Ци Цусимы", rank_name: "Эксперт", sp: 950 }
    ]
  },
  slot2: {
    id: "char_demo_02",
    character_name: "Харуто Фукудо",
    character_avatar: "/assets/character/tactical_action.png",
    slot: 2,
    is_owner: true,
    organization: "Мрачный Блеск",
    rank: "Капитан Корпуса",
    attribute_name: "Теневой Раскол",
    reputation: 920,
    reputation_tier: { name: "Ветеран Синдиката", key: "veteran" },
    ap: 420,
    ap_multiplier: 100,
    sp_multiplier: 100,
    total_sp: 1100,
    krw: 8900000,
    yen: 340000,
    salary_multiplier: 100,
    weekly_salary: { amount: 850000, currency: "krw" },
    physical_stats: {
      is_registered: true,
      punch_kg: 7800,
      durability_kg: 23400,
      lifting_kg: 11500,
      speed_kmh: 410,
      reaction_s: 0.03
    },
    styles: [
      { id: "style_3", name: "Теневой Шаг Кабукичо", rank_name: "Эксперт", sp: 1100 }
    ]
  }
};

DEMO_CHARACTERS.activeCharacter = DEMO_CHARACTERS.slot1;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const savedDemo = localStorage.getItem('verge_demo_user');
    if (savedDemo) {
      try { return JSON.parse(savedDemo); } catch (e) {}
    }
    return null;
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchUser = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/auth/me', {
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      });
      
      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}`);
      }

      const data = await res.json();
      if (data.authenticated && data.user) {
        setUser(data.user);
        localStorage.removeItem('verge_demo_user');
      }
    } catch (err) {
      // If no live session and saved demo exists, keep demo user
      const savedDemo = localStorage.getItem('verge_demo_user');
      if (savedDemo) {
        try { setUser(JSON.parse(savedDemo)); } catch (e) {}
      }
    } finally {
      setLoading(false);
    }
  };

  const loginAsDemoUser = () => {
    const demoUser = {
      id: "demo_operative_01",
      username: "operative_preview",
      global_name: "Оперативник Verge",
      avatarUrl: "/assets/character/hero_portrait.png",
      permissions: {
        isAdmin: true,
        isStaff: true,
        isGM: true,
        isAnketolog: true
      },
      is_admin: true,
      is_staff: true,
      capabilities: {
        canAccessAdmin: true,
        canManageWiki: true,
        canManageApplications: true,
        canViewPrivateCharacters: true,
        canViewInventories: true,
        canManageCharacters: true,
        canManageEconomy: true,
        canViewAuditLog: true
      },
      characters: { ...DEMO_CHARACTERS }
    };
    setUser(demoUser);
    localStorage.setItem('verge_demo_user', JSON.stringify(demoUser));
  };

  const switchSlot = async (slotNumber) => {
    // If in demo mode
    if (user?.id === "demo_operative_01") {
      const newActiveChar = slotNumber === 2 ? user.characters.slot2 : user.characters.slot1;
      const updatedUser = {
        ...user,
        characters: {
          ...user.characters,
          activeSlot: slotNumber,
          activeCharacter: newActiveChar
        }
      };
      setUser(updatedUser);
      localStorage.setItem('verge_demo_user', JSON.stringify(updatedUser));
      return { success: true, characters: updatedUser.characters };
    }

    try {
      const res = await fetch('/api/auth/active-slot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ slot: slotNumber })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Ошибка переключения слота');
      }

      const data = await res.json();
      if (data.success && user) {
        setUser(prev => ({
          ...prev,
          characters: data.characters
        }));
      }
      return data;
    } catch (err) {
      console.error('Failed to switch slot:', err);
      throw err;
    }
  };

  const logout = async () => {
    localStorage.removeItem('verge_demo_user');
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include'
      });
    } catch (err) {}
    setUser(null);
  };

  useEffect(() => {
    fetchUser();
  }, []);

  const canManageWiki = Boolean(user?.capabilities?.canManageWiki || user?.permissions?.isAdmin || user?.is_admin);
  const canManageApplications = Boolean(user?.capabilities?.canManageApplications || user?.permissions?.isAnketolog || user?.permissions?.isAdmin || user?.is_admin);
  const isAdmin = Boolean(user?.permissions?.isAdmin || user?.is_admin);
  const isStaff = Boolean(user?.capabilities?.canAccessAdmin || user?.permissions?.isStaff || user?.is_staff || isAdmin);

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      error, 
      fetchUser, 
      switchSlot, 
      logout, 
      loginAsDemoUser,
      canManageWiki,
      canManageApplications,
      isAdmin,
      isStaff
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
