import * as React from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface ComboboxInputProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
  allowCustom?: boolean;
  showHierarchy?: boolean;
}

export function ComboboxInput({
  value,
  onChange,
  options,
  placeholder = "Select or type...",
  className,
  allowCustom = true,
  showHierarchy = false,
}: ComboboxInputProps) {
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState(value);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  // Filter options based on input
  const filteredOptions = React.useMemo(() => {
    if (!inputValue) return options;
    const searchValue = inputValue.toLowerCase();
    return options.filter((option) =>
      option.toLowerCase().includes(searchValue)
    );
  }, [options, inputValue]);

  // Update input value when prop changes
  React.useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Close dropdown when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        !inputRef.current?.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    setOpen(true);
    if (allowCustom) {
      onChange(newValue);
    }
  };

  const handleSelectOption = (option: string) => {
    setInputValue(option);
    onChange(option);
    setOpen(false);
  };

  const handleClear = () => {
    setInputValue("");
    onChange("");
    inputRef.current?.focus();
  };

  return (
    <div className={cn("relative", className)}>
      <div className="relative">
        <Input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className={cn("pr-16", className)}
        />
        <div className="absolute right-0 top-0 h-full flex items-center">
          {inputValue && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-full px-2 hover:bg-transparent"
              onClick={handleClear}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-full px-2 hover:bg-transparent"
            onClick={() => setOpen(!open)}
          >
            <ChevronsUpDown className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {open && (filteredOptions.length > 0 || (allowCustom && inputValue)) && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-sm shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none"
        >
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option) => {
              // Check if this is a sub-section (contains ">")
              const isSubSection = option.includes(" > ");
              const displayText = isSubSection && showHierarchy
                ? `  └─ ${option.split(" > ")[1]}`
                : option;
              const isParent = !isSubSection;

              return (
                <div
                  key={option}
                  className={cn(
                    "relative cursor-pointer select-none py-2 hover:bg-gray-100",
                    isParent && showHierarchy ? "font-semibold bg-gray-50 px-3" : "px-6",
                    value === option && "bg-blue-50"
                  )}
                  onClick={() => handleSelectOption(option)}
                >
                  <span className="block truncate">{displayText}</span>
                  {value === option && (
                    <Check className="absolute right-2 top-2.5 h-4 w-4 text-green-600" />
                  )}
                </div>
              );
            })
          ) : allowCustom && inputValue ? (
            <div
              className="cursor-pointer select-none py-2 px-3 hover:bg-gray-100"
              onClick={() => handleSelectOption(inputValue)}
            >
              <span className="block truncate">
                Use "{inputValue}" (new)
              </span>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}