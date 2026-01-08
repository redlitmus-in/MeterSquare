/**
 * Date formatting utilities for DD/MM/YYYY format
 */

/**
 * Format date to DD/MM/YYYY string
 * @param date - Date object or string
 * @returns Formatted date string in DD/MM/YYYY format
 */
export const formatDate = (date: Date | string | null | undefined): string => {
  if (!date) return '';
  
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  if (isNaN(dateObj.getTime())) return '';
  
  const day = dateObj.getDate().toString().padStart(2, '0');
  const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
  const year = dateObj.getFullYear();
  
  return `${day}/${month}/${year}`;
};

/**
 * Format date for HTML date input (YYYY-MM-DD)
 * @param date - Date object or string in DD/MM/YYYY format
 * @returns Formatted date string in YYYY-MM-DD format for HTML input
 */
export const formatDateForInput = (date: Date | string | null | undefined): string => {
  if (!date) return '';
  
  let dateObj: Date;
  
  if (typeof date === 'string') {
    // Check if date is in DD/MM/YYYY format
    if (date.includes('/')) {
      const [day, month, year] = date.split('/');
      dateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    } else {
      dateObj = new Date(date);
    }
  } else {
    dateObj = date;
  }
  
  if (isNaN(dateObj.getTime())) return '';
  
  const year = dateObj.getFullYear();
  const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
  const day = dateObj.getDate().toString().padStart(2, '0');
  
  return `${year}-${month}-${day}`;
};

/**
 * Parse date from DD/MM/YYYY format
 * @param dateStr - Date string in DD/MM/YYYY format
 * @returns Date object or null if invalid
 */
export const parseDateFromDDMMYYYY = (dateStr: string): Date | null => {
  if (!dateStr) return null;
  
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;
  
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed
  const year = parseInt(parts[2], 10);
  
  const date = new Date(year, month, day);
  
  // Validate the date
  if (date.getDate() !== day || date.getMonth() !== month || date.getFullYear() !== year) {
    return null;
  }
  
  return date;
};

/**
 * Get today's date in DD/MM/YYYY format
 * @returns Today's date formatted as DD/MM/YYYY
 */
export const getTodayFormatted = (): string => {
  return formatDate(new Date());
};

/**
 * Format date with time in DD/MM/YYYY HH:MM format
 * @param date - Date object or string
 * @returns Formatted date-time string
 */
export const formatDateTime = (date: Date | string | null | undefined): string => {
  if (!date) return '';

  const dateObj = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(dateObj.getTime())) return '';

  const dateStr = formatDate(dateObj);
  const hours = dateObj.getHours().toString().padStart(2, '0');
  const minutes = dateObj.getMinutes().toString().padStart(2, '0');

  return `${dateStr} ${hours}:${minutes}`;
};

/**
 * Format date with time in user's local timezone
 * @param date - Date object or string
 * @returns Formatted date-time string in local timezone with DD/MM/YYYY, HH:MM:SS AM/PM format
 */
export const formatDateTimeLocal = (date: Date | string | null | undefined): string => {
  if (!date) return '';

  let dateObj: Date;

  if (typeof date === 'string') {
    // Check if it's already in DD/MM/YYYY, HH:MM:SS AM/PM format (from backend)
    const ddmmyyyyRegex = /^(\d{2})\/(\d{2})\/(\d{4}),\s+(\d{2}):(\d{2}):(\d{2})\s+(AM|PM)$/;
    const match = date.match(ddmmyyyyRegex);

    if (match) {
      // Parse the backend format and treat it as UTC
      const [, day, month, year, hourStr, minute, second, ampm] = match;
      let hour = parseInt(hourStr);

      // Convert 12-hour to 24-hour format
      if (ampm === 'PM' && hour !== 12) hour += 12;
      if (ampm === 'AM' && hour === 12) hour = 0;

      // Create date in UTC
      const utcDateStr = `${year}-${month}-${day}T${hour.toString().padStart(2, '0')}:${minute}:${second}Z`;
      dateObj = new Date(utcDateStr);
    } else if (date.includes('Z') || date.includes('+') || date.match(/[+-]\d{2}:\d{2}$/)) {
      // Already has timezone info, parse directly
      dateObj = new Date(date);
    } else if (date.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
      // ISO format without timezone - assume it's UTC
      dateObj = new Date(date + 'Z');
    } else {
      // Other formats - try to parse directly
      dateObj = new Date(date);
    }
  } else {
    dateObj = date;
  }

  if (isNaN(dateObj.getTime())) return date?.toString() || '';

  // Format components individually for consistency
  const day = dateObj.getDate().toString().padStart(2, '0');
  const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
  const year = dateObj.getFullYear();

  // Format time in 12-hour format with AM/PM
  let hours = dateObj.getHours();
  const minutes = dateObj.getMinutes().toString().padStart(2, '0');
  const seconds = dateObj.getSeconds().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';

  // Convert to 12-hour format
  hours = hours % 12 || 12;
  const hoursStr = hours.toString().padStart(2, '0');

  return `${day}/${month}/${year}, ${hoursStr}:${minutes}:${seconds} ${ampm}`;
};

/**
 * Get user's timezone abbreviation
 * @returns Timezone abbreviation (e.g., "EST", "PST", "IST")
 */
export const getUserTimezone = (): string => {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const now = new Date();
  const short = now.toLocaleTimeString('en-US', { timeZoneName: 'short' });
  const match = short.match(/[A-Z]{2,}/g);
  return match ? match[0] : timezone;
};

/**
 * Get user's full timezone name
 * @returns Full timezone name (e.g., "America/New_York", "Asia/Kolkata")
 */
export const getUserTimezoneFull = (): string => {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
};

/**
 * Format timestamp for display with local timezone
 * @param timestamp - Timestamp string or Date object
 * @returns Formatted timestamp with timezone indicator
 */
export const formatTimestamp = (timestamp: Date | string | null | undefined): string => {
  if (!timestamp) return '';

  const formatted = formatDateTimeLocal(timestamp);
  const tz = getUserTimezone();

  return formatted ? `${formatted} (${tz})` : '';
};

/**
 * Format timestamp for display without timezone indicator
 * @param timestamp - Timestamp string or Date object
 * @returns Formatted timestamp in local time
 */
export const formatTimestampLocal = (timestamp: Date | string | null | undefined): string => {
  return formatDateTimeLocal(timestamp);
};

/**
 * Format date with relative time (e.g., "2 hours ago")
 * @param date - Date object or string
 * @returns Relative time string with local timezone context
 */
export const formatRelativeTime = (date: Date | string | null | undefined): string => {
  if (!date) return '';

  const dateObj = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(dateObj.getTime())) return '';

  const now = new Date();
  const diffMs = now.getTime() - dateObj.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;

  return formatDateTimeLocal(dateObj);
};