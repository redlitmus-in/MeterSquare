import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ClockIcon } from '@heroicons/react/24/outline';

interface TimePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  minTime?: string;
  maxTime?: string;
}

const CLOCK_RADIUS = 100;
const OUTER_NUM_RADIUS = 80;
const INNER_NUM_RADIUS = 52;
const HAND_OUTER = 76;
const HAND_INNER = 48;

function polarToXY(cx: number, cy: number, radius: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
}

export const TimePicker: React.FC<TimePickerProps> = ({ value, onChange, placeholder = 'HH:MM', className = '', minTime, maxTime }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const [selectedMinute, setSelectedMinute] = useState<number | null>(null);
  const [mode, setMode] = useState<'hour' | 'minute'>('hour');
  const [dragging, setDragging] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef<SVGSVGElement>(null);

  const minHour = minTime ? parseInt(minTime.split(':')[0], 10) : 0;
  const minMin = minTime ? parseInt(minTime.split(':')[1], 10) : 0;
  const maxHour = maxTime ? parseInt(maxTime.split(':')[0], 10) : 23;
  const maxMin = maxTime ? parseInt(maxTime.split(':')[1], 10) : 59;

  useEffect(() => {
    if (value) {
      const [h, m] = value.split(':').map(Number);
      setSelectedHour(h);
      setSelectedMinute(m);
    }
  }, [value]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setMode('hour');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const isHourDisabled = useCallback((h: number) => h < minHour || h > maxHour, [minHour, maxHour]);

  const isMinuteDisabled = useCallback((m: number) => {
    if (selectedHour === null) return false;
    if (selectedHour === minHour && m < minMin) return true;
    if (selectedHour === maxHour && m > maxMin) return true;
    return false;
  }, [selectedHour, minHour, minMin, maxHour, maxMin]);

  const getAngleFromEvent = useCallback((e: React.MouseEvent | MouseEvent) => {
    if (!clockRef.current) return null;
    const rect = clockRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
    if (angle < 0) angle += 360;
    return { angle, dist, maxDist: rect.width / 2 };
  }, []);

  const selectFromAngle = useCallback((angle: number, dist: number, maxDist: number) => {
    if (mode === 'hour') {
      const isInner = dist < maxDist * 0.62;
      const step = Math.round(angle / 30) % 12;
      const hour = isInner ? (step === 0 ? 0 : step + 12) : (step === 0 ? 12 : step);
      // Map: outer ring = 1-12, inner ring = 0,13-23
      // Actually: outer 0°=12, 30°=1...330°=11; inner 0°=0, 30°=13...330°=23
      if (!isHourDisabled(hour)) {
        setSelectedHour(hour);
      }
    } else {
      const step = Math.round(angle / 6) % 60;
      if (!isMinuteDisabled(step)) {
        setSelectedMinute(step);
      }
    }
  }, [mode, isHourDisabled, isMinuteDisabled]);

  const handleClockMouseDown = useCallback((e: React.MouseEvent) => {
    const result = getAngleFromEvent(e);
    if (!result) return;
    setDragging(true);
    selectFromAngle(result.angle, result.dist, result.maxDist);
  }, [getAngleFromEvent, selectFromAngle]);

  const handleClockMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;
    const result = getAngleFromEvent(e);
    if (!result) return;
    selectFromAngle(result.angle, result.dist, result.maxDist);
  }, [dragging, getAngleFromEvent, selectFromAngle]);

  const handleClockMouseUp = useCallback(() => {
    if (!dragging) return;
    setDragging(false);
    if (mode === 'hour' && selectedHour !== null) {
      setMode('minute');
    } else if (mode === 'minute' && selectedHour !== null && selectedMinute !== null) {
      const formatted = `${String(selectedHour).padStart(2, '0')}:${String(selectedMinute).padStart(2, '0')}`;
      onChange(formatted);
      setIsOpen(false);
      setMode('hour');
    }
  }, [dragging, mode, selectedHour, selectedMinute, onChange]);

  // Global mouse up to handle drag release outside SVG
  useEffect(() => {
    if (!dragging) return;
    const handleUp = () => {
      setDragging(false);
      if (mode === 'hour' && selectedHour !== null) {
        setMode('minute');
      }
    };
    window.addEventListener('mouseup', handleUp);
    return () => window.removeEventListener('mouseup', handleUp);
  }, [dragging, mode, selectedHour]);

  const handleConfirm = () => {
    if (selectedHour !== null && selectedMinute !== null) {
      const formatted = `${String(selectedHour).padStart(2, '0')}:${String(selectedMinute).padStart(2, '0')}`;
      onChange(formatted);
      setIsOpen(false);
      setMode('hour');
    }
  };

  const handleCancel = () => {
    setIsOpen(false);
    setMode('hour');
  };

  // Compute hand angle
  const getHandAngle = () => {
    if (mode === 'hour') {
      if (selectedHour === null) return null;
      return (selectedHour % 12) * 30;
    } else {
      if (selectedMinute === null) return null;
      return selectedMinute * 6;
    }
  };

  const isInnerHour = (h: number) => h === 0 || h > 12;

  const handAngle = getHandAngle();
  const handRadius = mode === 'hour' && selectedHour !== null && isInnerHour(selectedHour) ? HAND_INNER : HAND_OUTER;
  const cx = CLOCK_RADIUS;
  const cy = CLOCK_RADIUS;

  const displayValue = value || placeholder;

  // Generate hour numbers
  const outerHours = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const innerHours = [0, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];

  // Generate minute numbers (show every 5)
  const minuteNumbers = Array.from({ length: 12 }, (_, i) => i * 5);

  return (
    <div className="relative">
      <div className={`relative ${className}`}>
        <input
          type="text"
          value={displayValue}
          onClick={() => setIsOpen(!isOpen)}
          readOnly
          placeholder={placeholder}
          className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-400 bg-white cursor-pointer"
        />
        <ClockIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div ref={dropdownRef} className="bg-white rounded-2xl shadow-2xl w-[280px] overflow-hidden">
            {/* Header */}
            <div className="bg-gray-800 text-white px-5 py-4">
              <div className="text-xs uppercase tracking-wider opacity-60 mb-1">Select Time</div>
              <div className="flex items-center gap-1 text-4xl font-light">
                <button
                  onClick={() => setMode('hour')}
                  className={`px-2 py-0.5 rounded-md transition-all ${mode === 'hour' ? 'bg-white/15' : 'opacity-50 hover:opacity-80'}`}
                >
                  {selectedHour !== null ? String(selectedHour).padStart(2, '0') : '--'}
                </button>
                <span className="opacity-50">:</span>
                <button
                  onClick={() => selectedHour !== null && setMode('minute')}
                  className={`px-2 py-0.5 rounded-md transition-all ${mode === 'minute' ? 'bg-white/15' : 'opacity-50 hover:opacity-80'} ${selectedHour === null ? 'cursor-not-allowed' : ''}`}
                >
                  {selectedMinute !== null ? String(selectedMinute).padStart(2, '0') : '--'}
                </button>
              </div>
            </div>

            {/* Clock face */}
            <div className="flex justify-center py-4 px-4">
              <div className="relative" style={{ width: CLOCK_RADIUS * 2, height: CLOCK_RADIUS * 2 }}>
                <svg
                  ref={clockRef}
                  width={CLOCK_RADIUS * 2}
                  height={CLOCK_RADIUS * 2}
                  onMouseDown={handleClockMouseDown}
                  onMouseMove={handleClockMouseMove}
                  onMouseUp={handleClockMouseUp}
                  className="cursor-pointer select-none"
                >
                  {/* Background circle */}
                  <circle cx={cx} cy={cy} r={CLOCK_RADIUS - 2} fill="#f5f5f5" stroke="#e5e7eb" strokeWidth="1" />

                  {/* Clock hand */}
                  {handAngle !== null && (
                    <>
                      <line
                        x1={cx}
                        y1={cy}
                        x2={polarToXY(cx, cy, handRadius, handAngle).x}
                        y2={polarToXY(cx, cy, handRadius, handAngle).y}
                        stroke="#1f2937"
                        strokeWidth="2"
                      />
                      <circle cx={cx} cy={cy} r="3" fill="#1f2937" />
                      <circle
                        cx={polarToXY(cx, cy, handRadius, handAngle).x}
                        cy={polarToXY(cx, cy, handRadius, handAngle).y}
                        r="16"
                        fill="#1f2937"
                        opacity="0.9"
                      />
                    </>
                  )}

                  {/* Hour numbers */}
                  {mode === 'hour' && (
                    <>
                      {outerHours.map((h, i) => {
                        const angle = i * 30;
                        const pos = polarToXY(cx, cy, OUTER_NUM_RADIUS, angle);
                        const disabled = isHourDisabled(h);
                        const selected = selectedHour === h;
                        return (
                          <text
                            key={`outer-${h}`}
                            x={pos.x}
                            y={pos.y}
                            textAnchor="middle"
                            dominantBaseline="central"
                            fontSize="14"
                            fontWeight={selected ? '600' : '400'}
                            fill={selected ? '#ffffff' : disabled ? '#d1d5db' : '#374151'}
                            className="pointer-events-none"
                          >
                            {h}
                          </text>
                        );
                      })}
                      {innerHours.map((h, i) => {
                        const angle = i * 30;
                        const pos = polarToXY(cx, cy, INNER_NUM_RADIUS, angle);
                        const disabled = isHourDisabled(h);
                        const selected = selectedHour === h;
                        return (
                          <text
                            key={`inner-${h}`}
                            x={pos.x}
                            y={pos.y}
                            textAnchor="middle"
                            dominantBaseline="central"
                            fontSize="12"
                            fontWeight={selected ? '600' : '400'}
                            fill={selected ? '#ffffff' : disabled ? '#d1d5db' : '#6b7280'}
                            className="pointer-events-none"
                          >
                            {String(h).padStart(2, '0')}
                          </text>
                        );
                      })}
                    </>
                  )}

                  {/* Minute numbers */}
                  {mode === 'minute' && minuteNumbers.map((m, i) => {
                    const angle = i * 30;
                    const pos = polarToXY(cx, cy, OUTER_NUM_RADIUS, angle);
                    const disabled = isMinuteDisabled(m);
                    const selected = selectedMinute === m;
                    return (
                      <text
                        key={`min-${m}`}
                        x={pos.x}
                        y={pos.y}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize="14"
                        fontWeight={selected ? '600' : '400'}
                        fill={selected ? '#ffffff' : disabled ? '#d1d5db' : '#374151'}
                        className="pointer-events-none"
                      >
                        {String(m).padStart(2, '0')}
                      </text>
                    );
                  })}
                </svg>
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-100">
              <button
                onClick={handleCancel}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={selectedHour === null || selectedMinute === null}
                className="px-4 py-2 text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
