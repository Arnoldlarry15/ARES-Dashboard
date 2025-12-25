import React, { useState } from 'react';
import { UserRole, getRoleInfo } from '../types/auth';
import { AuthService } from '../services/authService';
import { Shield, Lock, User as UserIcon, ChevronRight } from 'lucide-react';

interface AuthLoginProps {
  onLogin: () => void;
}

export const AuthLogin: React.FC<AuthLoginProps> = ({ onLogin }) => {
  const [selectedRole, setSelectedRole] = useState<UserRole>(UserRole.ANALYST);

  const roles = [
    UserRole.ADMIN,
    UserRole.RED_TEAM_LEAD,
    UserRole.ANALYST,
    UserRole.VIEWER
  ];

  const handleLogin = (role: UserRole) => {
    AuthService.initDemoSession(role);
    onLogin();
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* Animated background */}
      <div className="fixed inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0A192F] via-[#1A3A52] to-[#0A192F]"></div>
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyan-400/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-red-500/10 rounded-full blur-3xl animate-pulse" style={{animationDelay: '1s'}}></div>
      </div>

      {/* Login card */}
      <div className="relative z-10 w-full max-w-md p-8">
        <div className="glass-strong rounded-3xl p-8 shadow-2xl border border-white/10">
          {/* Logo and branding */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center mb-6">
              <img 
                src="/logo.jpg" 
                alt="ARES Dashboard" 
                className="h-32 w-auto object-contain"
              />
            </div>
          </div>

          {/* Demo mode notice */}
          <div className="mb-6 p-4 glass rounded-xl border border-cyan-500/30">
            <div className="flex items-center gap-2 mb-2">
              <Lock className="w-4 h-4 text-cyan-400" />
              <span className="text-sm font-bold text-cyan-400">Demo Mode</span>
            </div>
            <p className="text-xs text-slate-400">
              Select a role to explore ARES Dashboard with role-based access control and audit logging.
            </p>
          </div>

          {/* Role selection */}
          <div className="space-y-3 mb-6">
            <label className="block text-sm font-bold text-slate-300 mb-3">Select Your Role</label>
            {roles.map(role => {
              const roleInfo = getRoleInfo(role);
              const isSelected = selectedRole === role;
              
              return (
                <button
                  key={role}
                  onClick={() => setSelectedRole(role)}
                  className={`w-full text-left p-4 rounded-xl transition-all duration-300 flex items-center justify-between group ${
                    isSelected
                      ? 'glass-strong border border-cyan-500/40 shadow-lg'
                      : 'glass border border-white/5 hover:border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${
                      isSelected ? 'bg-gradient-to-br from-cyan-500 to-cyan-600' : 'glass'
                    }`}>
                      <UserIcon className={`w-4 h-4 ${isSelected ? 'text-white' : 'text-slate-400'}`} />
                    </div>
                    <div>
                      <div className={`font-bold text-sm ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                        {roleInfo.label}
                      </div>
                      <div className="text-xs text-slate-500">
                        {roleInfo.description}
                      </div>
                    </div>
                  </div>
                  {isSelected && (
                    <div className="w-6 h-6 bg-cyan-500 rounded-full flex items-center justify-center">
                      <div className="w-2 h-2 bg-white rounded-full"></div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Login button */}
          <button
            onClick={() => handleLogin(selectedRole)}
            className="w-full px-6 py-4 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700 rounded-xl transition-all text-white font-bold shadow-lg glow-emerald hover:glow-emerald-strong group flex items-center justify-center gap-2"
          >
            <span>Enter Dashboard</span>
            <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>

          {/* Footer notice */}
          <p className="text-center text-xs text-slate-500 mt-6">
            Demo session expires in 24 hours • All actions are logged for audit
          </p>
        </div>
      </div>
    </div>
  );
};
