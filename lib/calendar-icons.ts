import { Briefcase, CalendarDays, Dumbbell, Flag, GraduationCap, Heart, House, Music, Plane, Utensils } from 'lucide-react';

export const calendarIcons = {
  calendar: { label: 'Kalender', Icon: CalendarDays },
  school: { label: 'School', Icon: GraduationCap },
  flag: { label: 'Vlag', Icon: Flag },
  home: { label: 'Huis', Icon: House },
  sport: { label: 'Sport', Icon: Dumbbell },
  work: { label: 'Werk', Icon: Briefcase },
  food: { label: 'Eten', Icon: Utensils },
  travel: { label: 'Reizen', Icon: Plane },
  heart: { label: 'Hart', Icon: Heart },
  music: { label: 'Muziek', Icon: Music },
};

export function resolveCalendarIcon(icon?: string) {
  return icon && Object.hasOwn(calendarIcons, icon) ? calendarIcons[icon as keyof typeof calendarIcons].Icon : undefined;
}
