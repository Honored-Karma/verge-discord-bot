import React from 'react';
import { 
  Globe, 
  Sparkles, 
  Flame, 
  Activity, 
  Shield, 
  Users, 
  UserCheck, 
  BookOpen, 
  FileText,
  HelpCircle
} from 'lucide-react';

export function WikiCategoryIcon({ category, size = 20, color = 'var(--accent-purple)' }) {
  switch (category) {
    case 'world':
      return <Globe size={size} color={color} />;
    case 'phenomena':
      return <Sparkles size={size} color={color} />;
    case 'attributes':
      return <Flame size={size} color={color} />;
    case 'biology-and-stats':
      return <Activity size={size} color={color} />;
    case 'martial-arts':
      return <Shield size={size} color={color} />;
    case 'organizations':
      return <Users size={size} color={color} />;
    case 'characters':
      return <UserCheck size={size} color={color} />;
    case 'rules':
      return <BookOpen size={size} color={color} />;
    default:
      return <FileText size={size} color={color} />;
  }
}
