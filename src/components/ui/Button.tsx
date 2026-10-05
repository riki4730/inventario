"use client";

import { Loader2 } from "lucide-react";

interface SpinnerProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function Spinner({ className = "", size = "md" }: SpinnerProps) {
  const sizes = { sm: "h-4 w-4", md: "h-5 w-5", lg: "h-8 w-8" };
  return (
    <Loader2 className={`animate-spin ${sizes[size]} ${className}`} aria-hidden />
  );
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  variant?: "primary" | "secondary" | "danger" | "success" | "ghost";
  size?: "sm" | "md" | "lg";
}

export function Button({
  children,
  loading,
  variant = "primary",
  size = "md",
  className = "",
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  const variants = {
    primary: "bg-teal-600 text-white hover:bg-teal-700 shadow-sm",
    secondary: "bg-slate-100 text-slate-800 hover:bg-slate-200",
    danger: "bg-rose-600 text-white hover:bg-rose-700",
    success: "bg-emerald-600 text-white hover:bg-emerald-700",
    ghost: "bg-transparent text-slate-600 hover:bg-slate-100",
  };
  const sizes = {
    sm: "px-3 py-1.5 text-sm gap-1.5",
    md: "px-4 py-2 text-sm gap-2",
    lg: "px-5 py-2.5 text-base gap-2",
  };

  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center rounded-xl font-medium transition disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  );
}
