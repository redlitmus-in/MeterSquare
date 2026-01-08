/**
 * Workflow Integration Utilities
 * 
 * This module provides utilities for integrating forms with approval workflows
 * according to the PDF workflow specifications.
 */

export interface WorkflowConfig {
  documentType: 'purchase_requisition' | 'vendor_quotation' | 'vendor_scope_of_work' | 'material_requisition' | 'material_delivery_note';
  requiredFlags: string[];
  approvalSequence: string[];
  rejectionLoops: {
    [key: string]: string[];
  };
}

// Workflow configurations based on PDF requirements
export const WORKFLOW_CONFIGS: { [key: string]: WorkflowConfig } = {
  purchase_requisition: {
    documentType: 'purchase_requisition',
    requiredFlags: ['QTY/SPEC FLAG', 'COST FLAG', 'PM FLAG'],
    approvalSequence: [
      'SITE_SUPERVISOR',
      'PROCUREMENT', 
      'PROJECT_MANAGER',
      'ESTIMATION',
      'TECHNICAL_DIRECTOR',
      'ACCOUNTS',
      'DESIGN'
    ],
    rejectionLoops: {
      'QTY_SPEC_REJECTION': ['SITE_SUPERVISOR', 'PROCUREMENT'],
      'COST_REJECTION': ['ESTIMATION', 'PROJECT_MANAGER']
    }
  },
  
  vendor_quotation: {
    documentType: 'vendor_quotation', 
    requiredFlags: ['QTY/SCOPE FLAG', 'PM FLAG'],
    approvalSequence: [
      'PROCUREMENT',
      'PROJECT_MANAGER',
      'ESTIMATION',
      'TECHNICAL_DIRECTOR',
      'ACCOUNTS',
      'DESIGN'
    ],
    rejectionLoops: {
      'QTY_SCOPE_REJECTION': ['PROJECT_MANAGER', 'ESTIMATION']
    }
  },

  material_requisition: {
    documentType: 'material_requisition',
    requiredFlags: ['QTY/SPEC FLAG', 'PM FLAG'],
    approvalSequence: [
      'SITE_SUPERVISOR',
      'PROCUREMENT',
      'PROJECT_MANAGER', 
      'ESTIMATION',
      'TECHNICAL_DIRECTOR',
      'DESIGN'
    ],
    rejectionLoops: {
      'QTY_SPEC_REJECTION': ['SITE_SUPERVISOR', 'PROCUREMENT']
    }
  },

  material_delivery_note: {
    documentType: 'material_delivery_note',
    requiredFlags: ['QTY/SPEC/REQ FLAG'],
    approvalSequence: [
      'SITE_SUPERVISOR',
      'PROCUREMENT',
      'PROJECT_MANAGER',
      'TECHNICAL_DIRECTOR',
      'DESIGN'
    ],
    rejectionLoops: {
      'QTY_SPEC_REJECTION': ['SITE_SUPERVISOR', 'PROCUREMENT']
    }
  }
};

/**
 * Initialize workflow for a document
 */
export const initializeWorkflow = (
  documentType: string,
  documentId: string,
  formData: any
) => {
  const config = WORKFLOW_CONFIGS[documentType];
  
  if (!config) {
    throw new Error(`Unknown document type: ${documentType}`);
  }

  // This would typically call a backend API
  console.log('Initializing workflow:', {
    documentType,
    documentId,
    config,
    formData,
    message: 'Backend integration required for full workflow functionality'
  });

  return {
    workflowId: `WF-${documentId}`,
    currentStep: config.approvalSequence[0],
    requiredFlags: config.requiredFlags,
    status: 'initiated'
  };
};

/**
 * Get next approver in sequence
 */
export const getNextApprover = (documentType: string, currentStep: string) => {
  const config = WORKFLOW_CONFIGS[documentType];
  const currentIndex = config.approvalSequence.indexOf(currentStep);
  
  if (currentIndex === -1 || currentIndex === config.approvalSequence.length - 1) {
    return null; // End of workflow
  }
  
  return config.approvalSequence[currentIndex + 1];
};

/**
 * Check if all required flags are satisfied
 */
export const checkFlags = (documentType: string, flags: { [key: string]: boolean }) => {
  const config = WORKFLOW_CONFIGS[documentType];
  
  return config.requiredFlags.every(requiredFlag => {
    const flagKey = requiredFlag.toLowerCase().replace(/[^a-z]/g, '');
    return flags[flagKey] === true;
  });
};

/**
 * Handle rejection and determine revision loop
 */
export const handleRejection = (
  documentType: string, 
  rejectionType: string,
  currentStep: string
) => {
  const config = WORKFLOW_CONFIGS[documentType];
  const revisionSteps = config.rejectionLoops[rejectionType];
  
  if (!revisionSteps) {
    throw new Error(`Unknown rejection type: ${rejectionType}`);
  }
  
  return {
    revisionRequired: true,
    backToSteps: revisionSteps,
    message: `Document requires revision and will return to: ${revisionSteps.join(' -> ')}`
  };
};