import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function scoreColor(score: number | null): string {
  if (score === null) return 'text-gray-400'
  if (score >= 8) return 'text-green-600'
  if (score >= 6) return 'text-amber-500'
  return 'text-red-500'
}

export function scoreBg(score: number | null): string {
  if (score === null) return 'bg-gray-100 text-gray-500'
  if (score >= 8) return 'bg-green-50 text-green-700 border-green-200'
  if (score >= 6) return 'bg-amber-50 text-amber-700 border-amber-200'
  return 'bg-red-50 text-red-700 border-red-200'
}

export const CALL_TYPE_LABELS: Record<string, string> = {
  discovery:  'Discovery',
  ads_intro:  'Ads Intro',
  launch:     'Launch',
  follow_up:  'Follow Up',
  team:       'Team',
  other:      'Other',
}

export const CALL_TYPE_COLORS: Record<string, string> = {
  discovery:  'bg-blue-100 text-blue-700',
  ads_intro:  'bg-purple-100 text-purple-700',
  launch:     'bg-green-100 text-green-700',
  follow_up:  'bg-amber-100 text-amber-700',
  team:       'bg-gray-100 text-gray-600',
  other:      'bg-gray-100 text-gray-500',
}

export const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  warning:  'bg-amber-100 text-amber-700 border-amber-200',
  info:     'bg-blue-100 text-blue-700 border-blue-200',
}
