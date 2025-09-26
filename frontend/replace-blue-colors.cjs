// Script to replace all blue colors with #243d8a
const fs = require('fs');
const path = require('path');

// Define color mappings
const colorMappings = {
  // Light backgrounds - using opacity
  'blue-50': '[#243d8a]/5',
  'blue-100': '[#243d8a]/10',
  
  // Medium backgrounds
  'blue-200': '[#243d8a]/20',
  'blue-300': '[#243d8a]/30',
  'blue-400': '[#243d8a]/40',
  
  // Primary colors
  'blue-500': '[#243d8a]',
  'blue-600': '[#243d8a]',
  'blue-700': '[#243d8a]/90',
  
  // Dark variants
  'blue-800': '[#243d8a]/80',
  'blue-900': '[#243d8a]',
  
  // Text colors
  'text-blue-500': 'text-[#243d8a]',
  'text-blue-600': 'text-[#243d8a]',
  'text-blue-700': 'text-[#243d8a]/90',
  'text-blue-800': 'text-[#243d8a]/80',
  'text-blue-900': 'text-[#243d8a]',
  
  // Background colors
  'bg-blue-50': 'bg-[#243d8a]/5',
  'bg-blue-100': 'bg-[#243d8a]/10',
  'bg-blue-200': 'bg-[#243d8a]/20',
  'bg-blue-300': 'bg-[#243d8a]/30',
  'bg-blue-400': 'bg-[#243d8a]/40',
  'bg-blue-500': 'bg-[#243d8a]',
  'bg-blue-600': 'bg-[#243d8a]',
  'bg-blue-700': 'bg-[#243d8a]/90',
  'bg-blue-800': 'bg-[#243d8a]/80',
  'bg-blue-900': 'bg-[#243d8a]',
  
  // Border colors
  'border-blue-200': 'border-[#243d8a]/20',
  'border-blue-300': 'border-[#243d8a]/30',
  'border-blue-400': 'border-[#243d8a]/40',
  'border-blue-500': 'border-[#243d8a]',
  'border-blue-600': 'border-[#243d8a]',
  
  // Gradient colors
  'from-blue-50': 'from-[#243d8a]/5',
  'from-blue-100': 'from-[#243d8a]/10',
  'from-blue-500': 'from-[#243d8a]',
  'from-blue-600': 'from-[#243d8a]',
  'to-blue-50': 'to-[#243d8a]/5',
  'to-blue-100': 'to-[#243d8a]/10',
  'to-blue-500': 'to-[#243d8a]',
  'to-blue-600': 'to-[#243d8a]/80',
  
  // Hover states
  'hover:bg-blue-50': 'hover:bg-[#243d8a]/5',
  'hover:bg-blue-100': 'hover:bg-[#243d8a]/10',
  'hover:bg-blue-600': 'hover:bg-[#243d8a]/90',
  'hover:bg-blue-700': 'hover:bg-[#243d8a]/80',
  'hover:text-blue-600': 'hover:text-[#243d8a]',
  'hover:text-blue-700': 'hover:text-[#243d8a]/90',
  'hover:border-blue-500': 'hover:border-[#243d8a]',
  
  // Focus states
  'focus:border-blue-500': 'focus:border-[#243d8a]',
  'focus:ring-blue-500': 'focus:ring-[#243d8a]',
  
  // Ring colors
  'ring-blue-500': 'ring-[#243d8a]',
  'ring-blue-400': 'ring-[#243d8a]/40'
};

// Function to process a file
function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  
  for (const [oldColor, newColor] of Object.entries(colorMappings)) {
    const regex = new RegExp(`\\b${oldColor}\\b`, 'g');
    if (content.match(regex)) {
      content = content.replace(regex, newColor);
      modified = true;
    }
  }
  
  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ Updated: ${filePath}`);
    return true;
  }
  return false;
}

// Function to walk directory
function walkDir(dir) {
  let updatedCount = 0;
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      // Skip node_modules and .git
      if (file !== 'node_modules' && file !== '.git' && file !== 'dist' && file !== 'build') {
        updatedCount += walkDir(filePath);
      }
    } else if (file.endsWith('.tsx') || file.endsWith('.ts') || file.endsWith('.jsx') || file.endsWith('.js')) {
      if (processFile(filePath)) {
        updatedCount++;
      }
    }
  }
  
  return updatedCount;
}

// Main execution
console.log('🎨 Starting color replacement: blue → #243d8a');
console.log('================================================\n');

const srcPath = path.join(__dirname, 'src');
const totalUpdated = walkDir(srcPath);

console.log('\n================================================');
console.log(`✨ Complete! Updated ${totalUpdated} files with new color scheme.`);
console.log('🎨 All blue colors have been replaced with #243d8a');