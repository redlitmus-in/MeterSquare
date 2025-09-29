# CLAUDE.md - Development Guidelines for MeterSquare ERP

## Project Overview
MeterSquare ERP is a comprehensive project management system for construction/interior projects with role-based access control and complete financial tracking.

## Tech Stack
- **Frontend**: React 18 + TypeScript + Vite
- **UI Framework**: TailwindCSS + Framer Motion
- **Charts**: Highcharts
- **State Management**: Zustand
- **Icons**: Heroicons + Lucide React
- **Notifications**: Sonner

## Project Structure
```
MeterSquare/
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── dashboards/         # Role-specific dashboards
│   │   │   ├── technical-director/ # TD specific pages
│   │   │   └── ...
│   │   ├── components/
│   │   │   ├── layout/            # Layout components (Sidebar, Header)
│   │   │   └── ...
│   │   ├── store/                 # Zustand stores
│   │   ├── types/                 # TypeScript definitions
│   │   └── utils/                 # Utility functions
│   └── ...
└── README.md                       # Complete project documentation
```

## Development Commands
```bash
# Frontend development
cd frontend
npm run dev        # Start dev server on port 3000
npm run build     # Build for production
npm run lint      # Run ESLint
npm run type-check # TypeScript checking
```

## Key Development Guidelines

### 1. Role-Based Access Control
- **Technical Director**: Can only assign Project Managers, NOT Site Engineers
- **Project Manager**: Assigns Site Engineers after being assigned by TD
- **Site Engineer**: Limited access, no purchasing capabilities

### 2. UI/UX Standards
- Use soft gradient backgrounds (blue-50 to blue-100 for headers)
- Card-based layouts with shadow-md for elevation
- Consistent spacing: p-6 for containers, gap-4/6 for grids
- Motion animations for better user experience

### 3. Color Scheme
- **Primary**: Blue (#3b82f6)
- **Success**: Green (#10b981)
- **Warning**: Yellow (#f59e0b)
- **Danger**: Red (#ef4444)
- **Gradients**: Always soft (from-*-50 to-*-100)

### 4. Component Patterns
```tsx
// Always use motion for animations
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ delay: 0.1 }}
>
  {/* Component content */}
</motion.div>

// Card pattern with gradient
<div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 shadow-md">
  {/* Card content */}
</div>
```

### 5. Highcharts Configuration
```javascript
const chartConfig = {
  chart: {
    backgroundColor: 'transparent',
    style: { fontFamily: 'inherit' }
  },
  credits: { enabled: false },
  // Use gradient colors for series
  color: {
    linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
    stops: [[0, '#ef4444'], [1, '#fca5a5']]
  }
};
```

## Workflow Implementation

### Technical Director Workflow
1. **Reviews BOQ Estimations**
   - Detailed material breakdown
   - Labor costs
   - Profit margins
   - Approve/Reject with reasoning

2. **Assigns Project Managers**
   - Only assigns PM to approved projects
   - Does NOT assign Site Engineers
   - Monitors PM workload

3. **Portfolio Oversight**
   - All projects dashboard
   - Budget vs actual tracking
   - Performance metrics

### Important Corrections Made
1. **Team Assignment Page**:
   - TD only assigns Project Managers
   - Site Engineer assignment removed from TD's Team Assignment page
   - PM assigns SE through their own interface

2. **Navigation**:
   - Removed Procurement and Vendor Management for TD
   - Added Project Approvals, Team Assignment, Projects Overview
   - No Analytics page (removed as per requirements)

## API Integration Points (Future)
```javascript
// BOQ Approval
POST /api/projects/{id}/approve
POST /api/projects/{id}/reject

// Team Assignment
POST /api/projects/{id}/assign-pm
{
  "projectId": 1,
  "projectManagerId": 123
}

// PM assigns SE (not TD)
POST /api/projects/{id}/assign-se
{
  "projectId": 1,
  "siteEngineerId": 456
}
```

## Testing Checklist
- [ ] TD can view all pending BOQ estimations
- [ ] TD can see detailed material breakdown in BOQ
- [ ] TD can approve/reject projects
- [ ] TD can assign ONLY Project Managers
- [ ] TD cannot assign Site Engineers
- [ ] TD can monitor all active projects
- [ ] Navigation shows correct items for TD role
- [ ] Dashboard charts load with correct data

## Common Issues & Solutions

### Issue: Sidebar not showing TD navigation
**Solution**: Check role_id format variations in ModernSidebar.tsx

### Issue: TypeError with roleId.toLowerCase
**Solution**: Add type checking: `typeof roleId === 'string' ? roleId.toLowerCase() : ''`

### Issue: Missing icons
**Solution**: Import both outline and solid versions from Heroicons

## Performance Optimization
1. Use lazy loading for pages
2. Implement virtual scrolling for large lists
3. Memoize expensive calculations
4. Use React.memo for pure components

## Security Considerations
1. Role-based access at component level
2. No client-side sensitive data storage
3. Validate all user inputs
4. Sanitize data before display

## Future Enhancements
1. Real-time updates using WebSockets
2. PDF export for BOQ reports
3. Email notifications for approvals
4. Mobile responsive design improvements
5. Offline capability with service workers

## Deployment Notes
```bash
# Build optimized production bundle
cd frontend
npm run build

# Output will be in dist/ folder
# Deploy dist/ contents to web server
```

## Support & Maintenance
- Always test role permissions after changes
- Maintain consistent UI patterns
- Document any workflow changes in README.md
- Update this file when adding new features

---

*Last Updated: September 2024*
*Version: 1.0.0*