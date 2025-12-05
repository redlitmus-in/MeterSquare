export interface BOQSubSection {
  id: string;
  name: string;
  parentId: string;
  description?: string;
}

export interface BOQSection {
  id: string;
  name: string;
  description?: string;
  subSections?: BOQSubSection[];
}

export const defaultBOQSections: BOQSection[] = [
  {
    id: 'civil',
    name: 'Civil Works',
    description: 'All civil and structural work',
    subSections: [
      { id: 'civil-structural', name: 'Structural Works', parentId: 'civil', description: 'Concrete, steel structures' },
      { id: 'civil-masonry', name: 'Masonry Works', parentId: 'civil', description: 'Brick and block work' },
      { id: 'civil-flooring', name: 'Flooring Works', parentId: 'civil', description: 'All types of flooring' },
      { id: 'civil-finishes', name: 'Finishes', parentId: 'civil', description: 'Painting, plastering, etc.' },
      { id: 'civil-waterproofing', name: 'Waterproofing', parentId: 'civil', description: 'Waterproofing systems' },
      { id: 'civil-external', name: 'External Works', parentId: 'civil', description: 'Roads, pavements, landscaping' }
    ]
  },
  {
    id: 'mep',
    name: 'MEP Works',
    description: 'Mechanical, Electrical, and Plumbing',
    subSections: [
      { id: 'mep-electrical', name: 'Electrical Works', parentId: 'mep', description: 'Wiring, lighting, switchboards' },
      { id: 'mep-plumbing', name: 'Plumbing & Drainage', parentId: 'mep', description: 'Pipes, sanitary fittings' },
      { id: 'mep-hvac', name: 'HVAC', parentId: 'mep', description: 'Air conditioning and ventilation' },
      { id: 'mep-firefighting', name: 'Fire Fighting', parentId: 'mep', description: 'Fire suppression systems' },
      { id: 'mep-ict', name: 'ICT Systems', parentId: 'mep', description: 'Data, telecom, security systems' },
      { id: 'mep-bms', name: 'BMS', parentId: 'mep', description: 'Building management systems' }
    ]
  },
  {
    id: 'architectural',
    name: 'Architectural Works',
    description: 'Architectural elements and finishes',
    subSections: [
      { id: 'arch-doors', name: 'Doors & Windows', parentId: 'architectural', description: 'All doors and windows' },
      { id: 'arch-glass', name: 'Glass & Aluminium', parentId: 'architectural', description: 'Glazing and aluminium work' },
      { id: 'arch-ceilings', name: 'False Ceilings', parentId: 'architectural', description: 'Suspended ceiling systems' },
      { id: 'arch-cladding', name: 'Cladding', parentId: 'architectural', description: 'External and internal cladding' },
      { id: 'arch-partitions', name: 'Partitions', parentId: 'architectural', description: 'Internal partitions and dividers' },
      { id: 'arch-signage', name: 'Signage', parentId: 'architectural', description: 'Wayfinding and signage' }
    ]
  },
  {
    id: 'furniture',
    name: 'Furniture & Joinery',
    description: 'Custom furniture and joinery works',
    subSections: [
      { id: 'furn-office', name: 'Office Furniture', parentId: 'furniture', description: 'Desks, chairs, storage' },
      { id: 'furn-custom', name: 'Custom Joinery', parentId: 'furniture', description: 'Built-in furniture' },
      { id: 'furn-kitchen', name: 'Kitchen Cabinets', parentId: 'furniture', description: 'Kitchen and pantry units' },
      { id: 'furn-wardrobes', name: 'Wardrobes', parentId: 'furniture', description: 'Built-in wardrobes' },
      { id: 'furn-reception', name: 'Reception Desks', parentId: 'furniture', description: 'Reception counters' },
      { id: 'furn-fixtures', name: 'Fixtures', parentId: 'furniture', description: 'Fixed furniture items' }
    ]
  },
  {
    id: 'specialized',
    name: 'Specialized Works',
    description: 'Specialized systems and equipment',
    subSections: [
      { id: 'spec-elevators', name: 'Elevators & Escalators', parentId: 'specialized', description: 'Vertical transportation' },
      { id: 'spec-kitchen-eq', name: 'Kitchen Equipment', parentId: 'specialized', description: 'Commercial kitchen equipment' },
      { id: 'spec-laundry', name: 'Laundry Equipment', parentId: 'specialized', description: 'Laundry systems' },
      { id: 'spec-medical', name: 'Medical Equipment', parentId: 'specialized', description: 'Healthcare equipment' },
      { id: 'spec-av', name: 'Audio Visual', parentId: 'specialized', description: 'AV and multimedia systems' },
      { id: 'spec-gym', name: 'Gym Equipment', parentId: 'specialized', description: 'Fitness equipment' }
    ]
  }
];

// Helper function to get all sections as flat list for dropdown
export function getAllSectionsFlat(sections: BOQSection[]): Array<{value: string, label: string, isParent: boolean, parentName?: string}> {
  const flatList: Array<{value: string, label: string, isParent: boolean, parentName?: string}> = [];

  sections.forEach(section => {
    // Add parent section
    flatList.push({
      value: section.name,
      label: section.name,
      isParent: true
    });

    // Add sub-sections
    section.subSections?.forEach(subSection => {
      flatList.push({
        value: `${section.name} > ${subSection.name}`,
        label: `  └─ ${subSection.name}`,
        isParent: false,
        parentName: section.name
      });
    });
  });

  return flatList;
}

// Get all section names for dropdown (formatted)
export function getAllSectionNames(sections: BOQSection[]): string[] {
  const names: string[] = [];

  sections.forEach(section => {
    // Add parent section
    names.push(section.name);

    // Add sub-sections with formatting
    section.subSections?.forEach(subSection => {
      names.push(`${section.name} > ${subSection.name}`);
    });
  });

  return names;
}