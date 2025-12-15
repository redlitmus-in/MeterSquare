import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Store,
  Search,
  Package,
  CheckCircle,
  AlertCircle,
  ShoppingCart,
  Eye,
  ChevronDown,
  ChevronUp,
  Edit,
  Sparkles,
  Mail,
  Phone,
  MapPin,
  User,
  FileText,
  Download,
  Edit3,
  Loader2,
  Save,
  Plus,
  Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Purchase, buyerService, MaterialVendorSelection, LPOData } from '../services/buyerService';
import { buyerVendorService, Vendor, VendorProduct } from '../services/buyerVendorService';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/authStore';

interface MaterialVendorSelectionModalProps {
  purchase: Purchase;
  isOpen: boolean;
  onClose: () => void;
  onVendorSelected?: () => void;
  viewMode?: 'buyer' | 'td'; // 'buyer' = full edit mode, 'td' = simplified view for TD to change vendor
}

// Constants
const CURRENCY_CODE = 'AED';
const DEFAULT_VENDORS_PER_PAGE = 100;
const WORD_MATCH_THRESHOLD = 0.6;
const SHORT_MATERIAL_MAX_LENGTH = 2;
const SHORT_WORD_MAX_LENGTH = 3;
const MIN_CATEGORY_LENGTH = 3;
const MAX_VISIBLE_PRODUCTS = 3;
const SUBMISSION_ID_LENGTH = 9;

interface SelectedVendorInfo {
  vendor_id: number;
  vendor_name: string;
  send_individually: boolean; // Whether to send PO to this vendor separately
  negotiated_price?: number | null; // Custom price for this purchase
  save_price_for_future?: boolean; // Whether to update vendor's product price
}

interface MaterialVendorState {
  material_name: string;
  quantity: number;
  unit: string;
  selected_vendors: SelectedVendorInfo[]; // Changed to array for multi-select
  expanded: boolean;
  selection_mode: 'single' | 'multi'; // Single vendor or multiple vendors
}

const MaterialVendorSelectionModal: React.FC<MaterialVendorSelectionModalProps> = ({
  purchase,
  isOpen,
  onClose,
  onVendorSelected,
  viewMode = 'buyer' // Default to buyer mode
}) => {
  const { user } = useAuthStore();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [vendorProducts, setVendorProducts] = useState<Map<number, VendorProduct[]>>(new Map());
  const [loadingVendors, setLoadingVendors] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  // Material selection state - one entry per material
  const [materialVendors, setMaterialVendors] = useState<MaterialVendorState[]>([]);
  const [expandedMaterial, setExpandedMaterial] = useState<string | null>(null);

  // Price editing state
  const [editingPrice, setEditingPrice] = useState<{ materialName: string; vendorId: number } | null>(null);
  const [tempPrice, setTempPrice] = useState<string>('');

  // Expanded vendor state (for dropdown details)
  const [expandedVendorRow, setExpandedVendorRow] = useState<{ materialName: string; vendorId: number } | null>(null);

  // Expanded vendor groups in summary (for collapse/expand)
  const [expandedVendorGroups, setExpandedVendorGroups] = useState<Set<number>>(new Set());

  // Send separately option
  const [sendSeparately, setSendSeparately] = useState<boolean>(false);

  // Track vendors that have already been sent to TD (have sub-CRs created)
  const [sentVendorIds, setSentVendorIds] = useState<Set<number>>(new Set());

  // Confirmation dialog state for individual vendor send
  const [vendorSendConfirmation, setVendorSendConfirmation] = useState<{
    vendor_id: number;
    vendor_name: string;
    materials: Array<{ material_name: string; quantity: number; unit: string }>;
  } | null>(null);

  // LPO PDF state - Always enabled (mandatory)
  const includeLpoPdf = true; // LPO is now mandatory
  const [lpoData, setLpoData] = useState<LPOData | null>(null);
  const [isLoadingLpo, setIsLoadingLpo] = useState(false);
  const [showLpoEditor, setShowLpoEditor] = useState(false);
  const [includeSignatures, setIncludeSignatures] = useState(true);
  const [newCustomTerm, setNewCustomTerm] = useState('');
  const [editingTermIndex, setEditingTermIndex] = useState<number | null>(null);
  const [editingTermText, setEditingTermText] = useState('');
  const [isSavingLpo, setIsSavingLpo] = useState(false);
  const [lpoLastSaved, setLpoLastSaved] = useState<Date | null>(null);
  const [isSavingDefault, setIsSavingDefault] = useState(false);

  // Check if current user is Technical Director
  const isTechnicalDirector = user?.role?.toLowerCase().includes('technical') ||
                               user?.role?.toLowerCase().includes('director') ||
                               user?.role_name?.toLowerCase().includes('technical');

  // Check if TD has already approved any PO children
  const hasTdApprovedAnyPO = purchase.po_children && purchase.po_children.length > 0 &&
    purchase.po_children.some(poChild =>
      poChild.vendor_selection_status === 'approved' ||
      poChild.status === 'vendor_approved' ||
      poChild.status === 'purchase_completed'
    );

  // Helper function to check if a material is already in an approved POChild
  const isMaterialInApprovedPOChild = (materialName: string): boolean => {
    if (!purchase.po_children || purchase.po_children.length === 0) return false;

    const materialNameLower = materialName.toLowerCase().trim();
    return purchase.po_children.some(poChild => {
      // Check if POChild is approved or completed
      const isApproved = poChild.vendor_selection_status === 'approved' ||
                         poChild.status === 'vendor_approved' ||
                         poChild.status === 'purchase_completed';
      if (!isApproved) return false;

      // Check if this material is in the POChild
      return poChild.materials?.some(mat =>
        mat.material_name?.toLowerCase().trim() === materialNameLower
      );
    });
  };

  // Initialize material vendors state from purchase with auto-selection
  useEffect(() => {
    if (isOpen && purchase.materials && vendors.length > 0 && vendorProducts.size > 0) {
      // Auto-expand all vendor groups when modal opens
      const vendorIds = new Set<number>();
      purchase.materials.forEach(material => {
        const existingSelection = purchase.material_vendor_selections?.[material.material_name];
        if (existingSelection?.vendor_id) {
          vendorIds.add(existingSelection.vendor_id);
        }
      });
      setExpandedVendorGroups(vendorIds);

      // CRITICAL FIX: Filter out materials that are already in approved POChildren
      // This prevents duplicate vendor selection for already-approved materials
      const availableMaterials = purchase.materials.filter(material => {
        const isApproved = isMaterialInApprovedPOChild(material.material_name);
        return !isApproved;
      });

      const initialState = availableMaterials.map(material => {
        const existingSelection = purchase.material_vendor_selections?.[material.material_name];

        // PRIORITY 1: If this is a PO child, check if the material is part of this PO child's materials
        // and use the vendor info from the PO child record itself
        if (purchase.po_child_id && purchase.vendor_id) {
          // This is a PO child view - check if this material has vendor info and negotiated price
          const matchingMaterial = purchase.materials.find(m => m.material_name === material.material_name);
          if (matchingMaterial && matchingMaterial.negotiated_price !== undefined) {
            return {
              material_name: material.material_name,
              quantity: material.quantity,
              unit: material.unit,
              selected_vendors: [{
                vendor_id: purchase.vendor_id,
                vendor_name: purchase.vendor_name || 'Selected Vendor',
                send_individually: false,
                negotiated_price: matchingMaterial.negotiated_price,
                save_price_for_future: false
              }],
              expanded: false,
              selection_mode: 'single' as const
            };
          }
        }

        // PRIORITY 2: Check if there's any existing selection data (could be vendor selection or just negotiated price)
        if (existingSelection && existingSelection.vendor_id) {
          // If vendor_name exists, it means vendor was officially selected
          // If vendor_name is null/undefined, it means only negotiated price was saved
          const vendorInfo = vendors.find(v => v.vendor_id === existingSelection.vendor_id);

          if (vendorInfo) {
            return {
              material_name: material.material_name,
              quantity: material.quantity,
              unit: material.unit,
              selected_vendors: [{
                vendor_id: existingSelection.vendor_id,
                vendor_name: existingSelection.vendor_name || vendorInfo.company_name, // Use vendor name from DB or lookup
                send_individually: false,
                negotiated_price: existingSelection.negotiated_price, // Load negotiated price
                save_price_for_future: existingSelection.save_price_for_future
              }],
              expanded: false,
              selection_mode: 'single' as const
            };
          }
        }

        // Auto-select vendor with lowest cost
        const matchingVendors = getVendorsForMaterialWithCost(material.material_name);
        const selectedVendors: SelectedVendorInfo[] = [];

        if (matchingVendors.length > 0) {
          // Sort by lowest price
          const sortedVendors = [...matchingVendors].sort((a, b) => {
            const priceA = a.lowestPrice ?? Infinity;
            const priceB = b.lowestPrice ?? Infinity;
            return priceA - priceB;
          });

          // Auto-select the vendor with lowest price
          const bestVendor = sortedVendors[0];

          selectedVendors.push({
            vendor_id: bestVendor.vendor_id!,
            vendor_name: bestVendor.company_name,
            send_individually: false,
            negotiated_price: bestVendor.lowestPrice && bestVendor.lowestPrice < Infinity ? bestVendor.lowestPrice : undefined
          });
        }

        return {
          material_name: material.material_name,
          quantity: material.quantity,
          unit: material.unit,
          selected_vendors: selectedVendors,
          expanded: false,
          selection_mode: 'single' as const
        };
      });
      setMaterialVendors(initialState);
    }
  }, [isOpen, purchase, vendors, vendorProducts]);

  useEffect(() => {
    if (isOpen) {
      loadVendors();

      // Initialize sent vendor IDs ONLY from existing PO children or sub-CRs (not material_vendor_selections)
      const existingSentVendorIds = new Set<number>();

      // Check purchase.po_children first (new system)
      // Only add vendors from PENDING PO children - approved vendors can be reused for new materials
      if (purchase.po_children && purchase.po_children.length > 0) {
        purchase.po_children.forEach(poChild => {
          if (poChild.vendor_id && poChild.vendor_selection_status === 'pending_td_approval') {
            existingSentVendorIds.add(poChild.vendor_id);
          }
        });
      }

      setSentVendorIds(existingSentVendorIds);
    }
  }, [isOpen, purchase.po_children]);

  // Load LPO data when modal opens (for buyer mode only)
  useEffect(() => {
    if (isOpen && includeLpoPdf && !lpoData && viewMode === 'buyer') {
      loadLpoData();
    }
  }, [isOpen, includeLpoPdf, viewMode]);

  // Load LPO data function
  const loadLpoData = async () => {
    try {
      console.log('>>> loadLpoData: Starting for cr_id:', purchase.cr_id, 'po_child_id:', purchase.po_child_id);
      setIsLoadingLpo(true);
      const response = await buyerService.previewLPOPdf(purchase.cr_id, purchase.po_child_id);
      let enrichedLpoData = response.lpo_data;

      // Try to load default template if no custom terms exist
      const hasCustomTerms = ((response.lpo_data.terms?.custom_terms?.length || 0) > 0) ||
        (response.lpo_data.lpo_info?.custom_message);

      if (!hasCustomTerms) {
        try {
          const defaultTemplate = await buyerService.getLPODefaultTemplate();
          if (defaultTemplate.template) {
            enrichedLpoData = {
              ...enrichedLpoData,
              lpo_info: {
                ...enrichedLpoData.lpo_info,
                quotation_ref: defaultTemplate.template.quotation_ref || enrichedLpoData.lpo_info.quotation_ref,
                custom_message: defaultTemplate.template.custom_message || enrichedLpoData.lpo_info.custom_message,
              },
              vendor: {
                ...enrichedLpoData.vendor,
                subject: defaultTemplate.template.subject || enrichedLpoData.vendor.subject,
              },
              terms: {
                ...enrichedLpoData.terms,
                completion_terms: defaultTemplate.template.completion_terms || enrichedLpoData.terms.completion_terms,
                custom_terms: (defaultTemplate.template.custom_terms?.length || 0) > 0
                  ? defaultTemplate.template.custom_terms
                  : enrichedLpoData.terms.custom_terms,
              }
            };
            setIncludeSignatures(defaultTemplate.template.include_signatures);
            toast.info('Loaded default LPO template');
          }
        } catch {
          // No default template found - use existing data
        }
      }

      setLpoData(enrichedLpoData);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load LPO data';
      toast.error(errorMessage);
      // Don't uncheck the checkbox - let user retry
    } finally {
      setIsLoadingLpo(false);
    }
  };

  // Auto-save LPO customization
  const saveLpoCustomization = async () => {
    if (!lpoData) return;
    setIsSavingLpo(true);
    try {
      await buyerService.saveLPOCustomization(purchase.cr_id, lpoData, includeSignatures, purchase.po_child_id);
      setLpoLastSaved(new Date());
    } catch (error) {
      console.error('LPO auto-save failed:', error);
    } finally {
      setIsSavingLpo(false);
    }
  };

  // Save as default template
  const handleSaveAsDefault = async () => {
    if (!lpoData) return;
    setIsSavingDefault(true);
    try {
      await buyerService.saveLPODefaultTemplate(lpoData, includeSignatures);
      toast.success('Default template saved!');
    } catch (error: any) {
      toast.error(error.message || 'Failed to save default template');
    } finally {
      setIsSavingDefault(false);
    }
  };

  // Download LPO PDF preview
  const handleDownloadLpoPdf = async () => {
    if (!lpoData) {
      toast.error('LPO data not loaded');
      return;
    }
    try {
      const finalLpoData = !includeSignatures ? {
        ...lpoData,
        signatures: { ...lpoData.signatures, md_signature: null, td_signature: null, stamp_image: null }
      } : lpoData;

      const blob = await buyerService.generateLPOPdf(purchase.cr_id, finalLpoData);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `LPO-${purchase.cr_id}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('LPO PDF downloaded');
    } catch (error: any) {
      toast.error(error.message || 'Failed to download LPO PDF');
    }
  };

  // LPO is now mandatory, so no toggle function needed
  // Load LPO data automatically when modal opens

  // Helper function to check if a product matches a material
  const isProductMatchingMaterial = (
    productName: string,
    productCategory: string,
    vendorCategory: string,
    material: string
  ): boolean => {
    // Handle very short material names (1-2 characters) with exact matching
    // First check for EXACT match (case-insensitive) - highest priority
    if (productName === material) {
      return true;
    }

    // Check if material is contained in product name or vice versa
    if (productName.includes(material) || material.includes(productName)) {
      return true;
    }

    if (material.length <= SHORT_MATERIAL_MAX_LENGTH) {
      // For very short materials (1-2 chars), check if product name contains the exact material as a standalone word
      const escapedMaterial = material.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const materialRegex = new RegExp(`\\b${escapedMaterial}\\b`, 'i');
      const exactMatch = materialRegex.test(productName);

      // Also check if material is at start or end of product name
      const startsOrEndsWith = productName.toLowerCase().startsWith(material) ||
                               productName.toLowerCase().endsWith(material);

      return exactMatch || startsOrEndsWith;
    }

    // For longer material names, use word-based matching
    // Keep all words (don't filter by length) to handle cases like "de 01"
    const materialWords = material.split(/\s+/).filter(w => w.length > 0);
    const productWords = productName.split(/\s+/).filter(w => w.length > 0);

    let matchingWords = 0;
    let totalWords = materialWords.length;

    // If no words after split, fallback to direct contains check
    if (totalWords === 0) {
      return productName.includes(material) || material.includes(productName);
    }

    materialWords.forEach(matWord => {
      const matched = productWords.some(prodWord => {
        // Exact match (case already lowercased) - works for any length including 1 char
        if (prodWord === matWord) return true;

        // For longer words (>3 chars), allow partial matching
        if (prodWord.length > SHORT_WORD_MAX_LENGTH && matWord.length > SHORT_WORD_MAX_LENGTH) {
          if (prodWord.includes(matWord) || matWord.includes(prodWord)) return true;
        }

        // For short words (1-3 chars), check if they appear as substrings in longer words
        if (matWord.length >= 1 && matWord.length <= SHORT_WORD_MAX_LENGTH && prodWord.length > matWord.length) {
          if (prodWord.startsWith(matWord) || prodWord.endsWith(matWord)) return true;
        }

        // For single character matches, also check if product word starts with it
        if (matWord.length === 1 && prodWord.startsWith(matWord)) {
          return true;
        }

        return false;
      });
      if (matched) matchingWords++;
    });

    const matchThreshold = totalWords <= SHORT_MATERIAL_MAX_LENGTH ? totalWords : Math.ceil(totalWords * WORD_MATCH_THRESHOLD);
    const hasGoodWordMatch = matchingWords >= matchThreshold;

    const categoryMatch = !!(
      (productCategory && material.includes(productCategory) && productCategory.length > MIN_CATEGORY_LENGTH) ||
      (vendorCategory && material.includes(vendorCategory) && vendorCategory.length > MIN_CATEGORY_LENGTH)
    );

    return hasGoodWordMatch || categoryMatch;
  };

  const loadVendors = async () => {
    try {
      setLoadingVendors(true);
      // Use optimized endpoint that fetches vendors with products in a single request
      const response = await buyerVendorService.getAllVendorsWithProducts({
        status: 'active',
        per_page: DEFAULT_VENDORS_PER_PAGE
      });

      // Convert products array to Map for quick lookup
      const productsMap = new Map<number, VendorProduct[]>();
      response.vendors.forEach(vendor => {
        if (vendor.vendor_id && vendor.products) {
          productsMap.set(vendor.vendor_id, vendor.products);
        }
      });

      setVendorProducts(productsMap);
      setVendors(response.vendors);
    } catch (error: any) {
      console.error('Error loading vendors:', error);
      toast.error('Failed to load vendors');
    } finally {
      setLoadingVendors(false);
    }
  };

  // Get vendors that have products matching a specific material
  // Falls back to showing ALL vendors if no matches found (allows manual selection)
  const getVendorsForMaterial = (materialName: string): Vendor[] => {
    const result = getVendorsForMaterialWithFallbackInfo(materialName);
    return result.vendors;
  };

  // Helper to check if we have actual product matches or using fallback
  const getVendorsForMaterialWithFallbackInfo = (materialName: string): { vendors: Vendor[], isFallback: boolean } => {
    const materialLower = materialName.toLowerCase().trim();

    // First try to find vendors with matching products
    const matchedVendors = vendors.filter(vendor => {
      if (!vendor.vendor_id) return false;
      const products = vendorProducts.get(vendor.vendor_id) || [];
      const vendorCategory = vendor.category?.toLowerCase().trim() || '';

      return products.some(product => {
        const productName = product.product_name?.toLowerCase().trim() || '';
        const productCategory = product.category?.toLowerCase().trim() || '';
        return isProductMatchingMaterial(productName, productCategory, vendorCategory, materialLower);
      });
    });

    // If no matches found, return ALL vendors (fallback for manual selection)
    const isFallback = matchedVendors.length === 0;
    const vendorsToReturn = isFallback ? vendors.filter(v => v.vendor_id) : matchedVendors;

    // Apply search filter
    const filteredVendors = vendorsToReturn.filter(vendor => {
      if (!searchTerm) return true;
      return vendor.company_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
             vendor.category?.toLowerCase().includes(searchTerm.toLowerCase());
    });

    return { vendors: filteredVendors, isFallback };
  };

  // Get vendors with cost information for auto-selection
  const getVendorsForMaterialWithCost = (materialName: string): (Vendor & { lowestPrice?: number })[] => {
    const materialLower = materialName.toLowerCase().trim();

    return vendors
      .filter(vendor => {
        if (!vendor.vendor_id) return false;
        const products = vendorProducts.get(vendor.vendor_id) || [];
        const vendorCategory = vendor.category?.toLowerCase().trim() || '';

        return products.some(product => {
          const productName = product.product_name?.toLowerCase().trim() || '';
          const productCategory = product.category?.toLowerCase().trim() || '';
          return isProductMatchingMaterial(productName, productCategory, vendorCategory, materialLower);
        });
      })
      .map(vendor => {
        // Find lowest price among matching products
        const products = vendorProducts.get(vendor.vendor_id!) || [];
        const vendorCategory = vendor.category?.toLowerCase().trim() || '';

        const matchingProducts = products.filter(product => {
          const productName = product.product_name?.toLowerCase().trim() || '';
          const productCategory = product.category?.toLowerCase().trim() || '';
          return isProductMatchingMaterial(productName, productCategory, vendorCategory, materialLower);
        });

        const lowestPrice = matchingProducts.reduce((min, product) => {
          const price = product.unit_price ?? Infinity;
          return price < min ? price : min;
        }, Infinity);

        return {
          ...vendor,
          lowestPrice: lowestPrice === Infinity ? undefined : lowestPrice
        };
      });
  };

  const handleToggleSelectionMode = (materialName: string) => {
    setMaterialVendors(prev => prev.map(m =>
      m.material_name === materialName
        ? {
            ...m,
            selection_mode: m.selection_mode === 'single' ? 'multi' : 'single',
            selected_vendors: m.selection_mode === 'multi' && m.selected_vendors.length > 0
              ? [m.selected_vendors[0]] // Keep only first vendor when switching to single
              : m.selected_vendors
          }
        : m
    ));
  };

  const handleSelectVendorForMaterial = (materialName: string, vendorId: number, vendorName: string, vendorLowestPrice?: number) => {
    // TD mode with sub-POs: allow different vendors - backend will split the sub-PO if needed
    // No longer auto-selecting same vendor for all materials

    setMaterialVendors(prev => prev.map(m => {
      if (m.material_name !== materialName) return m;

      const isAlreadySelected = m.selected_vendors.some(v => v.vendor_id === vendorId);

      if (m.selection_mode === 'single') {
        // Single select mode - replace existing selection
        return {
          ...m,
          selected_vendors: [{
            vendor_id: vendorId,
            vendor_name: vendorName,
            send_individually: false,
            negotiated_price: vendorLowestPrice && vendorLowestPrice > 0 ? vendorLowestPrice : undefined
          }]
        };
      } else {
        // Multi-select mode - toggle vendor
        if (isAlreadySelected) {
          return {
            ...m,
            selected_vendors: m.selected_vendors.filter(v => v.vendor_id !== vendorId)
          };
        } else {
          return {
            ...m,
            selected_vendors: [...m.selected_vendors, {
              vendor_id: vendorId,
              vendor_name: vendorName,
              send_individually: false,
              negotiated_price: vendorLowestPrice && vendorLowestPrice > 0 ? vendorLowestPrice : undefined
            }]
          };
        }
      }
    }));
  };

  const handleToggleSendIndividually = (materialName: string, vendorId: number) => {
    setMaterialVendors(prev => prev.map(m => {
      if (m.material_name !== materialName) return m;

      return {
        ...m,
        selected_vendors: m.selected_vendors.map(v =>
          v.vendor_id === vendorId
            ? { ...v, send_individually: !v.send_individually }
            : v
        )
      };
    }));
  };

  const handleStartEditPrice = (materialName: string, vendorId: number, currentPrice?: number) => {
    setEditingPrice({ materialName, vendorId });
    setTempPrice(currentPrice?.toString() || '');
    // Auto-expand the dropdown to show the price editing interface
    setExpandedVendorRow({ materialName, vendorId });
  };

  const handleCancelEditPrice = () => {
    setEditingPrice(null);
    setTempPrice('');
  };

  const handleSavePrice = async (materialName: string, vendorId: number, saveForFuture: boolean) => {
    const price = parseFloat(tempPrice);

    if (isNaN(price) || price <= 0) {
      toast.error('Please enter a valid price');
      return;
    }

    try {
      // Always save the price to backend (whether for this BOQ or future)
      toast.loading(saveForFuture ? 'Updating vendor product price...' : 'Saving negotiated price...');

      // Call backend to update price, pass cr_id to save negotiated price to this purchase
      await buyerService.updateVendorPrice(vendorId, materialName, price, saveForFuture, purchase.cr_id);

      toast.dismiss();

      if (saveForFuture) {
        // Reload vendor products to reflect the updated catalog price
        toast.info('Refreshing vendor products...');
        await loadVendors();

        // Clear negotiated price since it's now the standard price
        setMaterialVendors(prev => prev.map(m => {
          if (m.material_name !== materialName) return m;

          return {
            ...m,
            selected_vendors: m.selected_vendors.map(v =>
              v.vendor_id === vendorId
                ? {
                    ...v,
                    negotiated_price: undefined,
                    save_price_for_future: undefined
                  }
                : v
            )
          };
        }));

        toast.success(`Price saved for future purchases: ${CURRENCY_CODE} ${price.toFixed(2)}`);
      } else {
        // For "This BOQ" option, update UI state with negotiated price
        setMaterialVendors(prev => prev.map(m => {
          if (m.material_name !== materialName) return m;

          return {
            ...m,
            selected_vendors: m.selected_vendors.map(v =>
              v.vendor_id === vendorId
                ? {
                    ...v,
                    negotiated_price: price,
                    save_price_for_future: false
                  }
                : v
            )
          };
        }));

        toast.success(`Negotiated price saved for this purchase: ${CURRENCY_CODE} ${price.toFixed(2)}`);

        // Trigger refresh of purchase data in parent component so data persists on modal reopen
        if (onVendorSelected) {
          onVendorSelected();
        }
      }

      setEditingPrice(null);
      setTempPrice('');
    } catch (error: any) {
      toast.dismiss();
      toast.error(error.message || 'Failed to save price');
      console.error('Error saving price:', error);
    }
  };

  const handleToggleMaterialExpand = (materialName: string) => {
    setExpandedMaterial(expandedMaterial === materialName ? null : materialName);
  };

  const handleToggleVendorGroup = (vendorId: number) => {
    setExpandedVendorGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(vendorId)) {
        newSet.delete(vendorId);
      } else {
        newSet.add(vendorId);
      }
      return newSet;
    });
  };

  const handleSubmitVendorGroup = async (vendorId: number, vendorName: string, materials: string[]) => {
    try {
      setIsSubmitting(true);

      // Filter materials for this specific vendor
      const vendorMaterialSelections = materialVendors
        .filter(m => materials.includes(m.material_name) && m.selected_vendors.length > 0)
        .filter(m => m.selected_vendors[0].vendor_id === vendorId)
        .map(m => ({
          material_name: m.material_name,
          vendor_id: m.selected_vendors[0].vendor_id,
          quantity: m.quantity,
          unit: m.unit,
          negotiated_price: m.selected_vendors[0].negotiated_price,
          save_price_for_future: m.selected_vendors[0].save_price_for_future,
          all_selected_vendors: m.selected_vendors.map(v => ({
            vendor_id: v.vendor_id,
            vendor_name: v.vendor_name,
            send_individually: v.send_individually,
            negotiated_price: v.negotiated_price,
            save_price_for_future: v.save_price_for_future
          })),
          project_name: purchase.project_name,
          project_code: purchase.project_code,
          boq_name: purchase.boq_name,
          item_name: purchase.item_name
        }));

      if (vendorMaterialSelections.length === 0) {
        toast.error('No materials to submit for this vendor');
        return;
      }

      const response = await buyerService.selectVendorForMaterial(
        purchase.cr_id,
        vendorMaterialSelections
      );

      toast.success(`${vendorMaterialSelections.length} material(s) sent to TD for ${vendorName}!`);
      onVendorSelected?.();
      onClose();
    } catch (error: any) {
      console.error('Error submitting vendor group:', error);
      toast.error(error.message || 'Failed to submit vendor group');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    // CRITICAL FIX: Filter out materials that are already in approved POChildren
    // This is a safety check in case the initialization didn't catch all cases
    const materialsNotApproved = materialVendors.filter(m => {
      const isApproved = isMaterialInApprovedPOChild(m.material_name);
      return !isApproved;
    });

    // Check if at least one material has a vendor selected (from non-approved materials only)
    const selectedMaterials = materialsNotApproved.filter(m => m.selected_vendors.length > 0);

    if (selectedMaterials.length === 0) {
      // Check if all materials were already approved
      const allApproved = materialVendors.every(m => isMaterialInApprovedPOChild(m.material_name));
      if (allApproved) {
        toast.error('All materials have already been approved. No new vendor selection needed.');
      } else {
        toast.error('Please select at least one vendor for any material');
      }
      return;
    }

    // Show warning if some materials don't have vendors
    const unselectedMaterials = materialsNotApproved.filter(m => m.selected_vendors.length === 0);
    if (unselectedMaterials.length > 0) {
      toast.warning(`${unselectedMaterials.length} material(s) without vendors will be skipped: ${unselectedMaterials.map(m => m.material_name).join(', ')}`);
    }

    // Save LPO customization before sending to TD (for buyer mode only)
    if (viewMode === 'buyer' && includeLpoPdf && lpoData) {
      try {
        await buyerService.saveLPOCustomization(purchase.cr_id, lpoData, includeSignatures);
      } catch (error) {
        console.error('Failed to save LPO customization:', error);
        // Don't block the submission, just log the error
      }
    }

    // Check if this is a re-selection for a rejected PO Child
    if (purchase.po_child_id && viewMode === 'buyer') {
      try {
        setIsSubmitting(true);
        // For PO Child re-selection, we only need to select one vendor for all materials
        const firstVendor = selectedMaterials[0]?.selected_vendors[0];
        if (!firstVendor) {
          toast.error('Please select a vendor');
          return;
        }

        const response = await buyerService.reselectVendorForPOChild(
          purchase.po_child_id,
          firstVendor.vendor_id
        );

        toast.success(response.message || 'Vendor re-selected! Awaiting TD approval.');
        onVendorSelected?.();
        onClose();
        return;
      } catch (error: any) {
        console.error('Error re-selecting vendor for PO Child:', error);
        toast.error(error.message || 'Failed to re-select vendor');
        return;
      } finally {
        setIsSubmitting(false);
      }
    }

    // For buyer mode: Check if full purchase to single vendor (no sub-PO needed)
    // or partial/multiple vendors (create sub-CRs)
    if (viewMode === 'buyer') {
      // Group materials by vendor
      const vendorGroupsMap = new Map<number, Array<typeof selectedMaterials[0]>>();

      selectedMaterials.forEach(material => {
        const vendorId = material.selected_vendors[0].vendor_id;
        if (!vendorGroupsMap.has(vendorId)) {
          vendorGroupsMap.set(vendorId, []);
        }
        vendorGroupsMap.get(vendorId)!.push(material);
      });

      const uniqueVendorCount = vendorGroupsMap.size;
      // Compare against non-approved materials, not all materialVendors
      const allMaterialsSelected = selectedMaterials.length === materialsNotApproved.length;

      // FULL PURCHASE TO SINGLE VENDOR: Update parent PO directly (no sub-PO)
      if (uniqueVendorCount === 1 && allMaterialsSelected) {
        // Show confirmation dialog for full purchase
        setShowConfirmation(true);
        return;
      }

      // PARTIAL OR MULTIPLE VENDORS: Create sub-CRs
      try {
        setIsSubmitting(true);

        // Prepare vendor groups data for sub-PO creation
        const vendorGroups = Array.from(vendorGroupsMap.entries()).map(([vendorId, materials]) => ({
          vendor_id: vendorId,
          vendor_name: materials[0].selected_vendors[0].vendor_name,
          materials: materials.map(m => ({
            material_name: m.material_name,
            quantity: m.quantity,
            unit: m.unit,
            negotiated_price: m.selected_vendors[0].negotiated_price,
            save_price_for_future: m.selected_vendors[0].save_price_for_future
          }))
        }));

        // Generate submission group ID
        const submissionGroupId = `${Date.now()}-${Math.random().toString(36).slice(2, 2 + SUBMISSION_ID_LENGTH)}`;

        // Call API to create PO children
        const response = await buyerService.createPOChildren(
          purchase.cr_id,
          vendorGroups,
          submissionGroupId
        );

        toast.success(response.message || `Sent to TD for approval!`);

        // Show individual PO child IDs created
        if (response.po_children && response.po_children.length > 0) {
          const poChildrenList = response.po_children.map((po: any) =>
            `${po.formatted_id} (${po.vendor_name})`
          ).join(', ');
          toast.info(`Purchase Orders Created: ${poChildrenList}`, { duration: 5000 });
        }

        onVendorSelected?.();
        onClose();
      } catch (error: any) {
        console.error('Error creating PO children:', error);
        toast.error(error.message || 'Failed to submit for approval');
      } finally {
        setIsSubmitting(false);
      }
    } else {
      // TD mode: show confirmation dialog for approval
      setShowConfirmation(true);
    }
  };

  const handleConfirmSelection = async () => {
    try {
      setIsSubmitting(true);
      setShowConfirmation(false);

      // Prepare material selections with negotiated prices
      const materialSelections = materialVendors
        .filter(m => m.selected_vendors.length > 0)
        .map(m => ({
          material_name: m.material_name,
          vendor_id: m.selected_vendors[0].vendor_id, // Use first vendor
          quantity: m.quantity,
          unit: m.unit,
          // Include negotiated price information
          negotiated_price: m.selected_vendors[0].negotiated_price,
          save_price_for_future: m.selected_vendors[0].save_price_for_future,
          // Include all selected vendors for reference
          all_selected_vendors: m.selected_vendors.map(v => ({
            vendor_id: v.vendor_id,
            vendor_name: v.vendor_name,
            send_individually: v.send_individually,
            negotiated_price: v.negotiated_price,
            save_price_for_future: v.save_price_for_future
          })),
          project_name: purchase.project_name,
          project_code: purchase.project_code,
          boq_name: purchase.boq_name,
          item_name: purchase.item_name
        }));

      const response = await buyerService.selectVendorForMaterial(
        purchase.cr_id,
        materialSelections
      );

      // Show different message based on mode and response type
      if (viewMode === 'td') {
        // Check if this was a multi-vendor split
        if (response.split_result) {
          const newPOChildren = response.split_result.po_children || [];
          toast.success(`Order split into ${newPOChildren.length} new purchase orders!`);
          // Show the new PO IDs
          if (newPOChildren.length > 0) {
            const poList = newPOChildren.map((po: any) =>
              `${po.formatted_id} (${po.vendor_name})`
            ).join(', ');
            toast.info(`New Orders: ${poList}`, { duration: 5000 });
          }
        } else {
          toast.success('Vendor Changed Successfully!');
        }
      } else {
        toast.success(response.message || 'Vendor selections sent for approval!');
      }
      onVendorSelected?.();
      onClose();
    } catch (error: any) {
      console.error('Error selecting vendors:', error);
      toast.error(error.message || 'Failed to select vendors');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Check if a material is actually in a pending PO child (locked)
  // IMPORTANT: Only lock if the material is EXPLICITLY in a PO child's materials list
  const isMaterialActuallyLocked = (materialName: string): boolean => {
    // Check po_children first (new system)
    if (purchase.po_children && purchase.po_children.length > 0) {
      for (const poChild of purchase.po_children) {
        // Only check pending PO children
        if (poChild.vendor_selection_status !== 'pending_td_approval') {
          continue;
        }

        // Skip if PO child has no materials array
        if (!poChild.materials || !Array.isArray(poChild.materials)) {
          continue;
        }

        // Check if this material name is in the PO child's materials
        const materialInPOChild = poChild.materials.find(m =>
          m.material_name === materialName
        );

        if (materialInPOChild) {
          return true; // Found in a pending PO child
        }
      }
    }

    return false; // Not found in any pending PO
  };

  // Exclude locked materials (actually in pending sub-CRs) from counts
  const unlockedMaterials = materialVendors.filter(m => !isMaterialActuallyLocked(m.material_name));
  const lockedMaterialsCount = materialVendors.length - unlockedMaterials.length;

  // Check if purchase is already split (has ANY PO children - regardless of status)
  // If split, we should hide the main "Submit for TD Approval" button and only show individual vendor buttons
  // Once a purchase is split, all subsequent submissions must go through individual vendor buttons
  const isPurchaseAlreadySplit = purchase.po_children && purchase.po_children.length > 0;

  const allMaterialsHaveVendors = unlockedMaterials.every(m => m.selected_vendors.length > 0);
  const selectedCount = unlockedMaterials.filter(m => m.selected_vendors.length > 0).length;
  const totalVendorSelections = unlockedMaterials.reduce((sum, m) => sum + m.selected_vendors.length, 0);

  // Count unique vendors selected across all materials
  // If more than 1 unique vendor is selected, hide the main "Submit for TD Approval" button
  const uniqueSelectedVendorIds = new Set<number>();
  unlockedMaterials.forEach(m => {
    if (m.selected_vendors.length > 0) {
      uniqueSelectedVendorIds.add(m.selected_vendors[0].vendor_id);
    }
  });
  const hasMultipleUniqueVendors = uniqueSelectedVendorIds.size > 1;

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Full Screen Page */}
          <div className="fixed inset-0 z-50 flex flex-col bg-gray-50 h-screen overflow-hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col h-full w-full overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className={`shrink-0 px-6 py-5 border-b ${viewMode === 'td' ? 'bg-gradient-to-r from-purple-50 to-purple-100 border-purple-200' : 'bg-gradient-to-r from-blue-50 to-blue-100 border-blue-200'}`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <ShoppingCart className={`w-6 h-6 ${viewMode === 'td' ? 'text-purple-600' : 'text-blue-600'}`} />
                      <h2 className="text-2xl font-bold text-gray-900">
                        {viewMode === 'td' ? 'Change Vendor Selection' : 'Select Vendors for Materials'}
                      </h2>
                    </div>
                    <div className="text-sm text-gray-600">
                      <span className="font-medium">Purchase Order:</span> PO #{purchase.cr_id} - {purchase.item_name}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {viewMode === 'td'
                        ? `Review and change vendor selections (${selectedCount}/${materialVendors.length} materials)`
                        : `Select vendor for each material (${selectedCount}/${materialVendors.length} selected)`
                      }
                    </div>
                  </div>
                  <button
                    onClick={onClose}
                    className="p-2 hover:bg-blue-200 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5 text-gray-600" />
                  </button>
                </div>
              </div>

              {/* Body - Full height scrollable */}
              <div className="flex-1 p-6 overflow-y-auto" style={{ minHeight: 0 }}>
                {/* Search Bar */}
                <div className="mb-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input
                      placeholder="Search vendors..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 border-gray-200 focus:border-blue-300 focus:ring-0 text-sm"
                    />
                  </div>
                </div>

                {/* AI-Powered Info Banner - Floating Light Navy & Red Theme - Only for Buyer mode */}
                {viewMode === 'buyer' && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{
                    opacity: 1,
                    y: [0, -3, 0]
                  }}
                  transition={{
                    opacity: { duration: 0.6, ease: "easeOut" },
                    y: {
                      duration: 3,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }
                  }}
                  className="mb-3 relative overflow-hidden rounded-xl shadow-md hover:shadow-lg transition-shadow duration-300"
                  style={{
                    background: 'linear-gradient(135deg, #dbeafe 0%, #fee2e2 100%)',
                    boxShadow: '0 4px 12px rgba(59, 130, 246, 0.15), 0 2px 6px rgba(220, 38, 38, 0.1)'
                  }}
                >
                  {/* Light border frame - Thicker */}
                  <div className="absolute inset-0 rounded-xl border-2 border-blue-300"></div>

                  {/* Shimmer effect - subtle moving shine */}
                  <div className="absolute inset-0 overflow-hidden rounded-xl">
                    <motion.div
                      animate={{
                        x: ['-100%', '200%']
                      }}
                      transition={{
                        duration: 3,
                        repeat: Infinity,
                        ease: "linear",
                        repeatDelay: 1
                      }}
                      className="h-full w-[30%] opacity-20"
                      style={{
                        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)',
                        transform: 'skewX(-20deg)',
                        filter: 'blur(10px)'
                      }}
                    />
                  </div>

                  {/* Content */}
                  <div className="relative px-4 py-2.5 flex items-center gap-3">
                    {/* AI Icon with light theme */}
                    <div className="flex-shrink-0 relative">
                      {/* Subtle pulsing glow */}
                      <motion.div
                        animate={{
                          opacity: [0.2, 0.4, 0.2],
                          scale: [1, 1.1, 1]
                        }}
                        transition={{
                          duration: 2,
                          repeat: Infinity,
                          ease: "easeInOut"
                        }}
                        className="absolute inset-0 rounded-full bg-gradient-to-tr from-blue-300/30 to-red-300/30 blur-lg"
                      />

                      {/* Icon container */}
                      <motion.div
                        animate={{
                          rotate: [0, 360]
                        }}
                        transition={{
                          duration: 20,
                          repeat: Infinity,
                          ease: "linear"
                        }}
                        className="relative w-8 h-8 rounded-full flex items-center justify-center bg-white shadow-sm border border-blue-200"
                      >
                        <Sparkles className="w-4 h-4 text-red-500" />
                      </motion.div>

                      {/* Tiny sparkles */}
                      <motion.div
                        animate={{
                          opacity: [0, 0.8, 0],
                          scale: [0, 1, 0]
                        }}
                        transition={{
                          duration: 2,
                          repeat: Infinity,
                          ease: "easeOut"
                        }}
                        className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-red-400"
                      />
                    </div>

                    {/* Text content - Compact */}
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-blue-900" style={{ fontFamily: 'system-ui, -apple-system' }}>
                        AI-Powered Vendor Selection
                      </h3>
                      <p className="text-xs text-blue-700/70 font-medium">
                        Intelligent system auto-matches best vendors based on availability, pricing & compatibility
                      </p>
                    </div>

                    {/* Connectivity icon - Compact */}
                    <div className="flex-shrink-0">
                      <motion.div
                        animate={{
                          opacity: [0.5, 1, 0.5]
                        }}
                        transition={{
                          duration: 2,
                          repeat: Infinity,
                          ease: "easeInOut"
                        }}
                      >
                        <div className="flex flex-col items-center gap-0.5">
                          <div className="w-1 h-1 rounded-full bg-red-400"></div>
                          <div className="w-1 h-1.5 rounded-full bg-red-400"></div>
                          <div className="w-1 h-2.5 rounded-full bg-red-500"></div>
                        </div>
                      </motion.div>
                    </div>
                  </div>

                  {/* Bottom subtle accent line */}
                  <motion.div
                    animate={{
                      opacity: [0.3, 0.6, 0.3],
                      scaleX: [0.8, 1, 0.8]
                    }}
                    transition={{
                      duration: 3,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                    className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-red-300/50 to-transparent"
                  />
                </motion.div>
                )}

                {/* Locked Materials Info Banner - Only show for Buyer mode */}
                {viewMode === 'buyer' && lockedMaterialsCount > 0 && (
                  <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-amber-900">
                          {lockedMaterialsCount} material{lockedMaterialsCount > 1 ? 's are' : ' is'} locked - Awaiting TD Approval
                        </p>
                        <p className="text-xs text-amber-700 mt-1">
                          These materials have already been sent to TD and cannot be modified until TD makes a decision.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Warning Note: Check carefully before sending - only show for Buyer mode with unlocked materials */}
                {viewMode === 'buyer' && unlockedMaterials.length > 0 && (
                  <div className="mb-4 p-3 bg-amber-50 border border-amber-300 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-amber-900">
                          Check carefully before sending to TD
                        </p>
                        <p className="text-xs text-amber-700 mt-1">
                          Once sent for approval, you <strong>cannot add more materials</strong> to the same vendor submission.
                          Make sure to assign all required materials before submitting.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* TD Mode: Info banner */}
                {viewMode === 'td' && (
                  <div className="mb-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-purple-900">
                          TD Vendor Change Mode
                        </p>
                        <p className="text-xs text-purple-700 mt-1">
                          You can select different vendors for each material. If you select different vendors, this order will be split into multiple purchase orders (one per vendor).
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Materials List with Vendor Selection */}
                {loadingVendors ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  <div className="space-y-3">
                    {materialVendors.map((material, materialIdx) => {
                      const isExpanded = expandedMaterial === material.material_name;
                      const vendorInfo = getVendorsForMaterialWithFallbackInfo(material.material_name);
                      const matchingVendors = vendorInfo.vendors;
                      const isShowingAllVendors = vendorInfo.isFallback;
                      const existingSelection = purchase.material_vendor_selections?.[material.material_name];
                      const selectionStatus = existingSelection?.selection_status;

                      // Check if material is ACTUALLY in a pending PO (not just material_vendor_selections status)
                      // A material is locked only if it exists in an actual PO child that's pending TD approval
                      const isMaterialInPendingPO = purchase.po_children?.some(poChild =>
                        poChild.vendor_selection_status === 'pending_td_approval' &&
                        poChild.materials?.some(m => m.material_name === material.material_name)
                      ) || false;

                      // Check if material is in an approved PO child
                      const isMaterialApproved = purchase.po_children?.some(poChild =>
                        poChild.vendor_selection_status === 'approved' &&
                        poChild.materials?.some(m => m.material_name === material.material_name)
                      ) || false;

                      // Lock material if it's in pending or approved PO
                      const isMaterialLocked = isMaterialInPendingPO || isMaterialApproved;

                      return (
                        <div
                          key={materialIdx}
                          className={`border-2 rounded-xl overflow-hidden ${
                            isMaterialApproved
                              ? 'border-green-300 bg-green-50/30'
                              : isMaterialLocked
                                ? 'border-amber-300 bg-amber-50/30'
                                : 'border-gray-200'
                          }`}
                        >
                          {/* Material Header - Clickable to expand/collapse (disabled if locked) */}
                          <div
                            onClick={() => !isMaterialLocked && handleToggleMaterialExpand(material.material_name)}
                            className={`px-4 py-3 border-b transition-colors ${
                              isMaterialApproved
                                ? 'bg-green-50 border-green-200 cursor-not-allowed'
                                : isMaterialLocked
                                  ? 'bg-amber-50 border-amber-200 cursor-not-allowed'
                                  : 'bg-gray-50 border-gray-200 cursor-pointer hover:bg-gray-100'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Package className="w-4 h-4 text-blue-600 flex-shrink-0" />
                                  <h3 className="font-semibold text-gray-900 truncate">{material.material_name}</h3>
                                  <span className="text-sm text-gray-500 flex-shrink-0">
                                    ({material.quantity} {material.unit})
                                  </span>
                                  {(() => {
                                    // Get BOQ price from original purchase materials
                                    const boqMaterial = purchase.materials?.find(m => m.material_name === material.material_name);
                                    const boqUnitPrice = boqMaterial?.unit_price || 0;
                                    const boqTotalAmount = boqUnitPrice * material.quantity;

                                    // Calculate vendor price
                                    let vendorTotalAmount: number | null = null;
                                    if (material.selected_vendors.length > 0) {
                                      const selectedVendor = material.selected_vendors[0];

                                      // Use negotiated price if available
                                      if (selectedVendor.negotiated_price) {
                                        vendorTotalAmount = selectedVendor.negotiated_price * material.quantity;
                                      } else {
                                        // Otherwise, try to find lowest price from vendor's matching products
                                        const vendorProductsList = vendorProducts.get(selectedVendor.vendor_id) || [];
                                        const vendorCategory = vendors.find(v => v.vendor_id === selectedVendor.vendor_id)?.category?.toLowerCase().trim() || '';
                                        const matchingProducts = vendorProductsList.filter(p => {
                                          const productName = p.product_name?.toLowerCase().trim() || '';
                                          const productCategory = p.category?.toLowerCase().trim() || '';
                                          return isProductMatchingMaterial(productName, productCategory, vendorCategory, material.material_name.toLowerCase());
                                        });

                                        if (matchingProducts.length > 0) {
                                          const lowestPrice = Math.min(...matchingProducts.map(p => p.unit_price || 0).filter(p => p > 0));
                                          if (lowestPrice > 0) {
                                            vendorTotalAmount = lowestPrice * material.quantity;
                                          }
                                        }
                                      }
                                    }

                                    return (
                                      <div className="flex items-center gap-2">
                                        {/* Vendor Amount - Primary display */}
                                        {vendorTotalAmount !== null && (
                                          <Badge className="bg-blue-100 text-blue-800 text-xs font-medium">
                                            {CURRENCY_CODE} {vendorTotalAmount.toFixed(2)}
                                          </Badge>
                                        )}
                                        {/* BOQ Amount - Secondary (smaller/grey) */}
                                        {boqTotalAmount > 0 && (
                                          <span className="text-[10px] text-gray-400">
                                            BOQ: {CURRENCY_CODE} {boqTotalAmount.toFixed(2)}
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })()}
                                  <Badge
                                    variant="outline"
                                    className={`text-xs ${isShowingAllVendors ? 'border-amber-400 text-amber-700 bg-amber-50' : ''}`}
                                  >
                                    {isShowingAllVendors
                                      ? `All ${matchingVendors.length} vendor${matchingVendors.length !== 1 ? 's' : ''} (no exact match)`
                                      : `${matchingVendors.length} vendor${matchingVendors.length !== 1 ? 's' : ''} available`
                                    }
                                  </Badge>
                                </div>

                                {/* Selected Vendors Display */}
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  {material.selected_vendors.length > 0 ? (
                                    <>
                                      {material.selected_vendors.map((selectedVendor, idx) => (
                                        <div key={idx} className="flex items-center gap-1">
                                          <Badge className="bg-green-100 text-green-800">
                                            <CheckCircle className="w-3 h-3 mr-1" />
                                            {selectedVendor.vendor_name}
                                          </Badge>
                                          {selectedVendor.send_individually && (
                                            <Badge className="bg-purple-100 text-purple-800 text-xs">
                                              Send Separate PO
                                            </Badge>
                                          )}
                                        </div>
                                      ))}
                                      {/* Only show Pending TD Approval if material is ACTUALLY in a pending PO */}
                                      {isMaterialInPendingPO && (
                                        <Badge className="bg-orange-100 text-orange-800 text-xs">
                                          Pending TD Approval
                                        </Badge>
                                      )}
                                      {/* Show Approved only if material is in an approved PO child */}
                                      {purchase.po_children?.some(poChild =>
                                        poChild.vendor_selection_status === 'approved' &&
                                        poChild.materials?.some(m => m.material_name === material.material_name)
                                      ) && (
                                        <Badge className="bg-green-100 text-green-800 text-xs">
                                          Approved
                                        </Badge>
                                      )}
                                    </>
                                  ) : (
                                    <Badge className="bg-red-100 text-red-800">
                                      <AlertCircle className="w-3 h-3 mr-1" />
                                      No vendor selected
                                    </Badge>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-2 flex-shrink-0">
                                {/* Expand/Collapse Indicator or Locked Status */}
                                {isMaterialApproved ? (
                                  <div className="flex items-center gap-2 px-3 py-1.5 border border-green-400 rounded-md bg-green-100 text-sm font-medium text-green-800">
                                    <CheckCircle className="w-4 h-4" />
                                    Approved
                                  </div>
                                ) : isMaterialLocked ? (
                                  <div className="flex items-center gap-2 px-3 py-1.5 border border-amber-400 rounded-md bg-amber-100 text-sm font-medium text-amber-800">
                                    <AlertCircle className="w-4 h-4" />
                                    Locked - Awaiting TD
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 px-3 py-1.5 border border-gray-300 rounded-md bg-white text-sm font-medium text-gray-700">
                                    {isExpanded ? (
                                      <>
                                        <ChevronUp className="w-4 h-4" />
                                        Hide
                                      </>
                                    ) : (
                                      <>
                                        <ChevronDown className="w-4 h-4" />
                                        Select
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Vendor Selection Panel - Only show if not locked */}
                          <AnimatePresence>
                            {isExpanded && !isMaterialLocked && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                              >
                                <div className="p-4 bg-white max-h-80 overflow-y-auto">
                                  {matchingVendors.length === 0 ? (
                                    <div className="text-center py-8">
                                      <Store className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                                      <p className="text-gray-500 text-sm">No vendors found for this material</p>
                                    </div>
                                  ) : (
                                    <>
                                      {/* Selection Info */}
                                      <div className="flex items-center justify-between text-xs mb-2 px-1">
                                        <span className="text-gray-600">
                                          {material.selection_mode === 'single'
                                            ? 'Select one vendor'
                                            : 'Select multiple vendors (for quotes)'}
                                        </span>
                                        <Badge variant="outline" className="text-xs">
                                          {material.selected_vendors.length} selected
                                        </Badge>
                                      </div>

                                      {/* Vendor List - Table Style */}
                                      <div className="overflow-hidden border border-gray-200 rounded-lg">
                                        {/* Table Header */}
                                        <div className="flex items-center gap-3 px-3 py-2 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-600">
                                          <div className="w-4"></div>
                                          <div className="flex-1">Vendor</div>
                                          <div className="w-16 text-center">Products</div>
                                          <div className="w-20 text-right">Unit Price</div>
                                          <div className="w-24 text-right">Est. Total</div>
                                          <div className="w-5"></div>
                                        </div>

                                      {matchingVendors.map(vendor => {
                                        const selectedVendorInfo = material.selected_vendors.find(v => v.vendor_id === vendor.vendor_id);
                                        const isSelected = !!selectedVendorInfo;
                                        const vendorProductsList = vendorProducts.get(vendor.vendor_id!) || [];
                                        const vendorCategory = vendor.category?.toLowerCase().trim() || '';

                                        // Check if this vendor has a negotiated price saved in the database
                                        const savedVendorSelection = existingSelection?.vendor_id === vendor.vendor_id ? existingSelection : null;
                                        const negotiatedPrice = selectedVendorInfo?.negotiated_price || savedVendorSelection?.negotiated_price;

                                        const matchingProducts = vendorProductsList.filter(p => {
                                          const productName = p.product_name?.toLowerCase().trim() || '';
                                          const productCategory = p.category?.toLowerCase().trim() || '';
                                          return isProductMatchingMaterial(
                                            productName,
                                            productCategory,
                                            vendorCategory,
                                            material.material_name.toLowerCase()
                                          );
                                        });

                                        // Calculate lowest price for display
                                        const lowestPrice = matchingProducts.length > 0
                                          ? Math.min(...matchingProducts.map(p => p.unit_price || 0).filter(p => p > 0))
                                          : 0;
                                        const totalEstimate = lowestPrice > 0 ? lowestPrice * material.quantity : 0;

                                        const isExpanded = expandedVendorRow?.materialName === material.material_name &&
                                                          expandedVendorRow?.vendorId === vendor.vendor_id;

                                        // Check if this vendor is already in a pending PO child (sent to TD)
                                        const isVendorSentToTD = purchase.po_children?.some(poChild =>
                                          poChild.vendor_id === vendor.vendor_id &&
                                          poChild.vendor_selection_status === 'pending_td_approval'
                                        ) || false;

                                        return (
                                          <div key={vendor.vendor_id}>
                                            {/* Vendor Row */}
                                            <div
                                              onClick={() => {
                                                if (isVendorSentToTD) {
                                                  toast.error('This vendor is already sent for TD approval. You cannot assign more materials to it.');
                                                  return;
                                                }
                                                handleSelectVendorForMaterial(
                                                  material.material_name,
                                                  vendor.vendor_id!,
                                                  vendor.company_name,
                                                  lowestPrice > 0 ? lowestPrice : undefined
                                                );
                                              }}
                                              onDoubleClick={(e) => {
                                                e.stopPropagation();
                                                setExpandedVendorRow(isExpanded
                                                  ? null
                                                  : { materialName: material.material_name, vendorId: vendor.vendor_id! }
                                                );
                                              }}
                                              className={`flex items-center gap-3 px-3 py-2 border-b border-gray-100 transition-colors ${
                                                isVendorSentToTD
                                                  ? 'bg-amber-50 cursor-not-allowed opacity-70'
                                                  : isSelected
                                                    ? 'bg-blue-50 hover:bg-blue-100 cursor-pointer'
                                                    : 'bg-white hover:bg-gray-50 cursor-pointer'
                                              }`}
                                            >
                                              {/* Edit Button - Moved to left */}
                                              {isSelected && (
                                                <div className="flex-shrink-0">
                                                  <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      const currentPrice = negotiatedPrice ||
                                                                         (matchingProducts.length > 0 ? matchingProducts[0].unit_price : undefined);
                                                      handleStartEditPrice(material.material_name, vendor.vendor_id!, currentPrice);
                                                    }}
                                                    className="h-8 w-8 p-0 border-2 border-amber-400 bg-amber-50 hover:bg-amber-100"
                                                    title="Edit price"
                                                  >
                                                    <Edit className="w-4 h-4 text-amber-600" />
                                                  </Button>
                                                </div>
                                              )}

                                              {/* Checkbox/Radio */}
                                              <div className="flex-shrink-0">
                                                {isVendorSentToTD ? (
                                                  <div className="w-4 h-4 rounded-full border-2 border-amber-400 bg-amber-100 flex items-center justify-center">
                                                    <AlertCircle className="w-3 h-3 text-amber-600" />
                                                  </div>
                                                ) : material.selection_mode === 'multi' ? (
                                                  <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    readOnly
                                                    className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                                                  />
                                                ) : (
                                                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                                                    isSelected ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                                                  }`}>
                                                    {isSelected && <div className="w-2 h-2 bg-white rounded-full" />}
                                                  </div>
                                                )}
                                              </div>

                                              {/* Vendor Name & Category */}
                                              <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                  <span className={`font-medium text-sm truncate ${isVendorSentToTD ? 'text-amber-700' : 'text-gray-900'}`}>
                                                    {vendor.company_name}
                                                  </span>
                                                  {isVendorSentToTD && (
                                                    <Badge className="bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0">
                                                      Sent to TD
                                                    </Badge>
                                                  )}
                                                </div>
                                                {vendor.category && (
                                                  <div className="text-xs text-gray-500 truncate">{vendor.category}</div>
                                                )}
                                              </div>

                                              {/* Products Count */}
                                              <div className="flex-shrink-0 text-center min-w-[60px]">
                                                <div className="text-xs font-medium text-green-700">{matchingProducts.length}</div>
                                                <div className="text-[10px] text-gray-500">product{matchingProducts.length !== 1 ? 's' : ''}</div>
                                              </div>

                                              {/* Price */}
                                              <div className="flex-shrink-0 text-right min-w-[80px]">
                                                {negotiatedPrice ? (
                                                  <>
                                                    <div className="text-sm font-semibold text-blue-700">{CURRENCY_CODE} {negotiatedPrice.toFixed(2)}</div>
                                                    {lowestPrice > 0 && (
                                                      <div className="text-[10px] text-gray-400 line-through">{CURRENCY_CODE} {lowestPrice.toFixed(2)}</div>
                                                    )}
                                                    <div className="text-[10px] text-purple-600">negotiated</div>
                                                  </>
                                                ) : lowestPrice > 0 ? (
                                                  <>
                                                    <div className="text-sm font-semibold text-blue-700">{CURRENCY_CODE} {lowestPrice.toFixed(2)}</div>
                                                    <div className="text-[10px] text-gray-500">/{material.unit}</div>
                                                  </>
                                                ) : (
                                                  <div className="text-xs text-gray-400">No price</div>
                                                )}
                                              </div>

                                              {/* Total Estimate with BOQ Comparison */}
                                              <div className="flex-shrink-0 text-right min-w-[90px]">
                                                {(negotiatedPrice ? negotiatedPrice * material.quantity : totalEstimate) > 0 ? (
                                                  <>
                                                    <div className="text-sm font-bold text-gray-900">
                                                      {CURRENCY_CODE} {(negotiatedPrice
                                                        ? negotiatedPrice * material.quantity
                                                        : totalEstimate).toFixed(2)}
                                                    </div>
                                                    {negotiatedPrice && totalEstimate > 0 && (
                                                      <div className="text-[10px] text-gray-400 line-through">{CURRENCY_CODE} {totalEstimate.toFixed(2)}</div>
                                                    )}
                                                    {/* BOQ Comparison - Below the amount */}
                                                    {(() => {
                                                      const boqMaterial = purchase.materials?.find(m => m.material_name === material.material_name);
                                                      const boqTotal = (boqMaterial?.unit_price || 0) * material.quantity;
                                                      const vendorTotal = negotiatedPrice ? negotiatedPrice * material.quantity : totalEstimate;

                                                      if (boqTotal > 0 && vendorTotal > 0) {
                                                        const diff = vendorTotal - boqTotal;
                                                        const isOver = diff > 0;
                                                        const isUnder = diff < 0;

                                                        return (
                                                          <div className={`text-[10px] font-semibold mt-0.5 ${
                                                            isOver
                                                              ? 'text-red-600'
                                                              : isUnder
                                                                ? 'text-green-600'
                                                                : 'text-gray-500'
                                                          }`}>
                                                            {isOver ? (
                                                              <span>+{diff.toFixed(0)} over</span>
                                                            ) : isUnder ? (
                                                              <span>{diff.toFixed(0)} under</span>
                                                            ) : (
                                                              <span>on budget</span>
                                                            )}
                                                          </div>
                                                        );
                                                      }
                                                      return <div className="text-[10px] text-gray-500">total</div>;
                                                    })()}
                                                  </>
                                                ) : (
                                                  <div className="text-xs text-gray-400">-</div>
                                                )}
                                              </div>
                                            </div>

                                            {/* Expanded Details Section */}
                                            <AnimatePresence>
                                              {isExpanded && isSelected && (
                                                <motion.div
                                                  initial={{ height: 0, opacity: 0 }}
                                                  animate={{ height: 'auto', opacity: 1 }}
                                                  exit={{ height: 0, opacity: 0 }}
                                                  className="overflow-hidden bg-gray-50"
                                                >
                                                  <div className="px-3 py-3 space-y-3">
                                                    {/* Price Editing Section */}
                                                    {editingPrice?.materialName === material.material_name &&
                                                     editingPrice?.vendorId === vendor.vendor_id ? (
                                                      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-2.5 rounded-lg border-2 border-blue-300">
                                                        <div className="flex items-center gap-2">
                                                          <Edit className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                                                          <span className="text-[10px] font-semibold text-gray-600 flex-shrink-0">{CURRENCY_CODE}</span>
                                                          <Input
                                                            type="number"
                                                            step="0.01"
                                                            min="0"
                                                            value={tempPrice}
                                                            onChange={(e) => setTempPrice(e.target.value)}
                                                            placeholder="0.00"
                                                            className="text-xs h-7 w-20 font-medium"
                                                            autoFocus
                                                          />
                                                          <span className="text-[10px] text-gray-600 flex-shrink-0">/{material.unit}</span>
                                                          <Button
                                                            size="sm"
                                                            onClick={(e) => {
                                                              e.stopPropagation();
                                                              handleSavePrice(material.material_name, vendor.vendor_id!, false);
                                                            }}
                                                            className="text-[10px] h-7 px-2 bg-blue-600 hover:bg-blue-700 text-white flex-shrink-0"
                                                            title="One-time price for current BOQ"
                                                          >
                                                            This BOQ
                                                          </Button>
                                                          <Button
                                                            size="sm"
                                                            onClick={(e) => {
                                                              e.stopPropagation();
                                                              handleSavePrice(material.material_name, vendor.vendor_id!, true);
                                                            }}
                                                            className="text-[10px] h-7 px-2 bg-green-600 hover:bg-green-700 text-white flex-shrink-0"
                                                            title="Updates vendor's product price permanently"
                                                          >
                                                            All Future
                                                          </Button>
                                                          <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={(e) => {
                                                              e.stopPropagation();
                                                              handleCancelEditPrice();
                                                            }}
                                                            className="h-7 w-7 p-0 hover:bg-blue-100 flex-shrink-0"
                                                            title="Cancel"
                                                          >
                                                            ✕
                                                          </Button>
                                                        </div>
                                                      </div>
                                                    ) : (
                                                      <>
                                                        {/* Vendor Contact Details */}
                                                        <div className="bg-white p-3 rounded border border-gray-200">
                                                          <div className="text-xs font-medium text-gray-700 mb-2">
                                                            Vendor Details
                                                          </div>
                                                          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                                                            {vendor.contact_person_name && (
                                                              <div className="flex items-center gap-2 text-xs">
                                                                <User className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                                                                <span className="text-gray-700 truncate">{vendor.contact_person_name}</span>
                                                              </div>
                                                            )}
                                                            {vendor.email && (
                                                              <div className="flex items-center gap-2 text-xs">
                                                                <Mail className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                                                                <span className="text-gray-700 truncate">{vendor.email}</span>
                                                              </div>
                                                            )}
                                                            {vendor.phone && (
                                                              <div className="flex items-center gap-2 text-xs">
                                                                <Phone className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                                                                <span className="text-gray-700">
                                                                  {vendor.phone_code ? `+${vendor.phone_code} ` : ''}{vendor.phone}
                                                                </span>
                                                              </div>
                                                            )}
                                                            {(vendor.street_address || vendor.city || vendor.country) && (
                                                              <div className="flex items-start gap-2 text-xs">
                                                                <MapPin className="w-3.5 h-3.5 text-gray-500 flex-shrink-0 mt-0.5" />
                                                                <span className="text-gray-700">
                                                                  {[vendor.street_address, vendor.city, vendor.state, vendor.country].filter(Boolean).join(', ')}
                                                                </span>
                                                              </div>
                                                            )}
                                                          </div>
                                                        </div>

                                                        {/* Price Comparison Section */}
                                                        {(() => {
                                                          const boqMaterial = purchase.materials?.find(m => m.material_name === material.material_name);
                                                          const boqUnitPrice = boqMaterial?.unit_price || 0;
                                                          const boqTotalAmount = boqUnitPrice * material.quantity;
                                                          const vendorUnitPrice = negotiatedPrice || lowestPrice;
                                                          const vendorTotalAmount = vendorUnitPrice * material.quantity;
                                                          const priceDiff = vendorTotalAmount - boqTotalAmount;
                                                          const isOverBudget = priceDiff > 0;

                                                          return (
                                                            <div className="bg-gradient-to-r from-blue-50 to-green-50 p-3 rounded border border-blue-200">
                                                              <div className="text-xs font-medium text-gray-700 mb-2">
                                                                Price Comparison
                                                              </div>
                                                              <div className="grid grid-cols-2 gap-4">
                                                                {/* BOQ Price */}
                                                                <div className="bg-white p-2 rounded border border-gray-200">
                                                                  <div className="text-[10px] text-gray-500 mb-1">BOQ Estimate</div>
                                                                  <div className="text-xs">
                                                                    <span className="text-gray-600">Unit: </span>
                                                                    <span className="font-semibold text-gray-800">{CURRENCY_CODE} {boqUnitPrice.toFixed(2)}</span>
                                                                  </div>
                                                                  <div className="text-xs mt-1">
                                                                    <span className="text-gray-600">Total: </span>
                                                                    <span className="font-bold text-gray-800">{CURRENCY_CODE} {boqTotalAmount.toFixed(2)}</span>
                                                                  </div>
                                                                </div>
                                                                {/* Vendor Price */}
                                                                <div className="bg-white p-2 rounded border border-blue-200">
                                                                  <div className="text-[10px] text-blue-600 mb-1">Vendor Price</div>
                                                                  <div className="text-xs">
                                                                    <span className="text-gray-600">Unit: </span>
                                                                    <span className="font-semibold text-blue-700">{CURRENCY_CODE} {vendorUnitPrice.toFixed(2)}</span>
                                                                  </div>
                                                                  <div className="text-xs mt-1">
                                                                    <span className="text-gray-600">Total: </span>
                                                                    <span className="font-bold text-blue-700">{CURRENCY_CODE} {vendorTotalAmount.toFixed(2)}</span>
                                                                  </div>
                                                                </div>
                                                              </div>
                                                              {/* Difference */}
                                                              {boqTotalAmount > 0 && vendorTotalAmount > 0 && (
                                                                <div className={`mt-2 text-xs text-center py-1 rounded ${
                                                                  isOverBudget ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                                                                }`}>
                                                                  {isOverBudget ? (
                                                                    <span>Over Budget: +{CURRENCY_CODE} {priceDiff.toFixed(2)}</span>
                                                                  ) : priceDiff < 0 ? (
                                                                    <span>Under Budget: {CURRENCY_CODE} {Math.abs(priceDiff).toFixed(2)} saved</span>
                                                                  ) : (
                                                                    <span>On Budget</span>
                                                                  )}
                                                                </div>
                                                              )}
                                                            </div>
                                                          );
                                                        })()}

                                                        {/* Matching Products List */}
                                                        <div className="bg-white p-3 rounded border border-gray-200">
                                                          <div className="text-xs font-medium text-gray-700 mb-2">
                                                            Matching Products ({matchingProducts.length})
                                                          </div>
                                                          <div className="space-y-1">
                                                            {matchingProducts.slice(0, MAX_VISIBLE_PRODUCTS).map((product, idx) => (
                                                              <div key={idx} className="flex justify-between items-center text-xs py-1">
                                                                <span className="text-gray-700 flex-1 truncate">{product.product_name}</span>
                                                                {product.unit_price && (
                                                                  <span className="text-blue-600 font-medium ml-2">
                                                                    {CURRENCY_CODE} {product.unit_price}/{product.unit || material.unit}
                                                                  </span>
                                                                )}
                                                              </div>
                                                            ))}
                                                            {matchingProducts.length > MAX_VISIBLE_PRODUCTS && (
                                                              <div className="text-[10px] text-gray-500 italic pt-1">
                                                                +{matchingProducts.length - MAX_VISIBLE_PRODUCTS} more products...
                                                              </div>
                                                            )}
                                                          </div>
                                                        </div>

                                                        {/* Send Separately Option (Multi-select only) */}
                                                        {material.selection_mode === 'multi' && (
                                                          <div className="bg-white p-3 rounded border border-gray-200">
                                                            <label
                                                              className="flex items-center gap-2 cursor-pointer"
                                                              onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleToggleSendIndividually(material.material_name, vendor.vendor_id!);
                                                              }}
                                                            >
                                                              <input
                                                                type="checkbox"
                                                                checked={selectedVendorInfo?.send_individually || false}
                                                                readOnly
                                                                className="w-4 h-4 text-purple-600 rounded cursor-pointer"
                                                              />
                                                              <span className="text-xs text-gray-700">Send separate PO with project details</span>
                                                            </label>
                                                          </div>
                                                        )}
                                                      </>
                                                    )}
                                                  </div>
                                                </motion.div>
                                              )}
                                            </AnimatePresence>
                                          </div>
                                        );
                                      })}
                                      </div>
                                    </>
                                  )}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Selection Summary - Grouped by Vendor - Only for Buyer mode */}
                {viewMode === 'buyer' && selectedCount > 0 && (
                  <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-xl">
                    <h4 className="font-semibold text-green-900 mb-3 flex items-center gap-2">
                      <CheckCircle className="w-5 h-5" />
                      Selection Summary ({selectedCount}/{materialVendors.length} materials, {totalVendorSelections} vendor selections)
                    </h4>

                    {/* Group materials by vendor */}
                    {(() => {
                      // Create vendor groups
                      const vendorGroups = new Map<number, {
                        vendor_id: number;
                        vendor_name: string;
                        materials: Array<{
                          material_name: string;
                          quantity: number;
                          unit: string;
                          unit_price: number;
                          total_amount: number;
                          boq_unit_price: number;
                          boq_total_amount: number;
                        }>;
                        total_amount: number;
                      }>();

                      // Group materials by their selected vendor (exclude materials actually in pending PO children)
                      // Also exclude vendors that are already sent to TD
                      materialVendors.filter(m => {
                        if (m.selected_vendors.length === 0) return false;
                        // Exclude materials that are actually in a pending PO child
                        if (isMaterialActuallyLocked(m.material_name)) return false;
                        // Exclude materials that are in an approved PO child (already processed)
                        const isMaterialInApprovedPO = purchase.po_children?.some(poChild =>
                          poChild.vendor_selection_status === 'approved' &&
                          poChild.materials?.some(pm => pm.material_name === m.material_name)
                        ) || false;
                        if (isMaterialInApprovedPO) return false;
                        // Exclude if selected vendor is already sent to TD
                        const selectedVendorId = m.selected_vendors[0]?.vendor_id;
                        const isVendorAlreadySent = purchase.po_children?.some(poChild =>
                          poChild.vendor_id === selectedVendorId &&
                          poChild.vendor_selection_status === 'pending_td_approval'
                        ) || sentVendorIds.has(selectedVendorId);
                        if (isVendorAlreadySent) return false;
                        return true;
                      }).forEach(material => {
                        const selectedVendor = material.selected_vendors[0];

                        // Get BOQ price from purchase materials
                        const purchaseMaterial = purchase.materials?.find(pm => pm.material_name === material.material_name);
                        const boqUnitPrice = purchaseMaterial?.unit_price || 0;
                        const boqTotalAmount = boqUnitPrice * material.quantity;

                        // Calculate vendor price
                        let vendorUnitPrice = 0;
                        let vendorMaterialAmount = 0;

                        if (selectedVendor.negotiated_price) {
                          vendorUnitPrice = selectedVendor.negotiated_price;
                          vendorMaterialAmount = selectedVendor.negotiated_price * material.quantity;
                        } else {
                          const vendorProductsList = vendorProducts.get(selectedVendor.vendor_id) || [];
                          const vendorCategory = vendors.find(v => v.vendor_id === selectedVendor.vendor_id)?.category?.toLowerCase().trim() || '';
                          const matchingProducts = vendorProductsList.filter(p => {
                            const productName = p.product_name?.toLowerCase().trim() || '';
                            const productCategory = p.category?.toLowerCase().trim() || '';
                            return isProductMatchingMaterial(productName, productCategory, vendorCategory, material.material_name.toLowerCase());
                          });

                          if (matchingProducts.length > 0) {
                            const lowestPrice = Math.min(...matchingProducts.map(p => p.unit_price || 0).filter(p => p > 0));
                            if (lowestPrice > 0) {
                              vendorUnitPrice = lowestPrice;
                              vendorMaterialAmount = lowestPrice * material.quantity;
                            }
                          }
                        }

                        // Add to vendor group
                        if (!vendorGroups.has(selectedVendor.vendor_id)) {
                          vendorGroups.set(selectedVendor.vendor_id, {
                            vendor_id: selectedVendor.vendor_id,
                            vendor_name: selectedVendor.vendor_name,
                            materials: [],
                            total_amount: 0
                          });
                        }

                        const group = vendorGroups.get(selectedVendor.vendor_id)!;
                        group.materials.push({
                          material_name: material.material_name,
                          quantity: material.quantity,
                          unit: material.unit,
                          unit_price: vendorUnitPrice,
                          total_amount: vendorMaterialAmount,
                          boq_unit_price: boqUnitPrice,
                          boq_total_amount: boqTotalAmount
                        });
                        group.total_amount += vendorMaterialAmount;
                      });

                      // Show individual send buttons if:
                      // 1. Multiple vendors are selected, OR
                      // 2. Purchase is already split (has pending PO children) - so we continue the split pattern
                      const hasMultipleVendors = vendorGroups.size > 1 || isPurchaseAlreadySplit;

                      return (
                        <div className="space-y-3">
                          {Array.from(vendorGroups.values()).map((vendorGroup, idx) => {
                            const isExpanded = expandedVendorGroups.has(vendorGroup.vendor_id);

                            return (
                              <div key={idx} className="bg-white rounded-lg border border-green-200 overflow-hidden">
                                {/* Vendor Header with Button Column */}
                                <div className="flex items-stretch">
                                  {/* Left Column: Vendor Info - Clickable */}
                                  <div
                                    onClick={() => handleToggleVendorGroup(vendorGroup.vendor_id)}
                                    className="flex-1 bg-gradient-to-r from-blue-50 to-blue-100 px-4 py-3 border-b border-blue-200 cursor-pointer hover:from-blue-100 hover:to-blue-150 transition-colors"
                                  >
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="flex items-center gap-2">
                                        <Store className="w-4 h-4 text-blue-600" />
                                        <span className="font-semibold text-gray-900">{vendorGroup.vendor_name}</span>
                                        <Badge className="bg-blue-100 text-blue-800 text-xs">
                                          {vendorGroup.materials.length} material{vendorGroup.materials.length !== 1 ? 's' : ''}
                                        </Badge>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        {vendorGroup.total_amount > 0 && (
                                          <span className="text-sm font-bold text-blue-700">
                                            {CURRENCY_CODE} {vendorGroup.total_amount.toFixed(2)}
                                          </span>
                                        )}
                                        {isExpanded ? (
                                          <ChevronUp className="w-4 h-4 text-gray-600" />
                                        ) : (
                                          <ChevronDown className="w-4 h-4 text-gray-600" />
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Right Column: Send Button - Show when:
                                      1. Multiple vendors are selected (hasMultipleVendors), OR
                                      2. Purchase is already split (isPurchaseAlreadySplit) - always use individual buttons */}
                                  {(hasMultipleVendors || isPurchaseAlreadySplit) && (
                                    <div className="flex items-center px-3 bg-gradient-to-r from-blue-50 to-blue-100 border-b border-blue-200">
                                      <Button
                                        onClick={(e) => {
                                          e.stopPropagation();

                                          // Get ONLY unlocked materials for this vendor to show in confirmation
                                          const vendorMaterials = materialVendors
                                            .filter(m => m.selected_vendors.length > 0)
                                            .filter(m => m.selected_vendors[0].vendor_id === vendorGroup.vendor_id)
                                            .filter(m => !isMaterialActuallyLocked(m.material_name)) // Exclude locked materials
                                            .map(m => ({
                                              material_name: m.material_name,
                                              quantity: m.quantity,
                                              unit: m.unit
                                            }));

                                          if (vendorMaterials.length === 0) {
                                            toast.error('No materials found for this vendor');
                                            return;
                                          }

                                          // Show confirmation dialog
                                          setVendorSendConfirmation({
                                            vendor_id: vendorGroup.vendor_id,
                                            vendor_name: vendorGroup.vendor_name,
                                            materials: vendorMaterials
                                          });
                                        }}
                                        disabled={isSubmitting}
                                        className="bg-green-600 hover:bg-green-700 text-white text-sm px-4 py-2 whitespace-nowrap"
                                      >
                                        {isSubmitting ? (
                                          <>
                                            <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                            Sending...
                                          </>
                                        ) : (
                                          <>
                                            <CheckCircle className="w-4 h-4 mr-2" />
                                            Send This Vendor to TD
                                          </>
                                        )}
                                      </Button>
                                    </div>
                                  )}
                                </div>

                                {/* Collapsible Content */}
                                <AnimatePresence>
                                  {isExpanded && (
                                    <motion.div
                                      initial={{ height: 0, opacity: 0 }}
                                      animate={{ height: 'auto', opacity: 1 }}
                                      exit={{ height: 0, opacity: 0 }}
                                      transition={{ duration: 0.2 }}
                                      className="overflow-hidden"
                                    >
                                      <div className="p-3">
                                        {/* Materials List */}
                                        <div className="space-y-2">
                                          {vendorGroup.materials.map((mat, matIdx) => {
                                            const priceDiff = mat.total_amount - mat.boq_total_amount;
                                            const isOverBudget = priceDiff > 0;
                                            const isUnderBudget = priceDiff < 0;

                                            return (
                                              <div key={matIdx} className="bg-gray-50 rounded px-3 py-2">
                                                <div className="flex items-center justify-between text-sm mb-1">
                                                  <div className="flex-1">
                                                    <div className="font-medium text-gray-900">{mat.material_name}</div>
                                                    <div className="text-xs text-gray-500 mt-0.5">
                                                      {mat.quantity} {mat.unit} {mat.unit_price > 0 && `× ${CURRENCY_CODE} ${mat.unit_price.toFixed(2)}`}
                                                    </div>
                                                  </div>
                                                  {mat.total_amount > 0 && (
                                                    <span className="text-sm font-semibold text-blue-700">
                                                      {CURRENCY_CODE} {mat.total_amount.toFixed(2)}
                                                    </span>
                                                  )}
                                                </div>

                                                {/* BOQ vs Vendor Comparison */}
                                                {mat.boq_total_amount > 0 && (
                                                  <div className="flex items-center justify-between text-xs pt-1 border-t border-gray-200 mt-1">
                                                    <span className="text-gray-500">
                                                      BOQ: {CURRENCY_CODE} {mat.boq_total_amount.toFixed(2)}
                                                    </span>
                                                    {priceDiff !== 0 && (
                                                      <span className={`font-medium ${isOverBudget ? 'text-red-600' : 'text-green-600'}`}>
                                                        {isOverBudget ? '+' : ''}{priceDiff.toFixed(2)} ({isOverBudget ? 'Over' : 'Under'})
                                                      </span>
                                                    )}
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}

                    {/* Grand Total */}
                    {(() => {
                      let vendorGrandTotal = 0;
                      let boqGrandTotal = 0;
                      let materialsWithPricesCount = 0; // Count materials that actually contribute to vendorGrandTotal

                      // Filter to only include materials that are NOT already in approved/pending PO children
                      materialVendors.filter(m => {
                        // Must have a vendor selected
                        if (m.selected_vendors.length === 0) return false;

                        // Exclude materials that are already in pending PO children (locked)
                        if (isMaterialActuallyLocked(m.material_name)) return false;

                        // Exclude materials in approved PO children (already processed)
                        const isMaterialInApprovedPO = purchase.po_children?.some(poChild =>
                          (poChild.vendor_selection_status === 'approved' || poChild.status === 'vendor_approved' || poChild.status === 'purchase_completed') &&
                          poChild.materials?.some(pm => pm.material_name === m.material_name)
                        ) || false;
                        if (isMaterialInApprovedPO) return false;

                        return true;
                      }).forEach(material => {
                        const selectedVendor = material.selected_vendors[0];

                        // Get BOQ total
                        const purchaseMaterial = purchase.materials?.find(pm => pm.material_name === material.material_name);
                        const boqUnitPrice = purchaseMaterial?.unit_price || 0;
                        boqGrandTotal += boqUnitPrice * material.quantity;

                        // Get vendor total - ONLY add if we have a valid vendor price
                        let vendorPrice = 0;
                        if (selectedVendor.negotiated_price && selectedVendor.negotiated_price > 0) {
                          vendorPrice = selectedVendor.negotiated_price;
                        } else {
                          const vendorProductsList = vendorProducts.get(selectedVendor.vendor_id) || [];
                          const vendorCategory = vendors.find(v => v.vendor_id === selectedVendor.vendor_id)?.category?.toLowerCase().trim() || '';
                          const matchingProducts = vendorProductsList.filter(p => {
                            const productName = p.product_name?.toLowerCase().trim() || '';
                            const productCategory = p.category?.toLowerCase().trim() || '';
                            return isProductMatchingMaterial(productName, productCategory, vendorCategory, material.material_name.toLowerCase());
                          });

                          if (matchingProducts.length > 0) {
                            const lowestPrice = Math.min(...matchingProducts.map(p => p.unit_price || 0).filter(p => p > 0));
                            if (lowestPrice > 0) {
                              vendorPrice = lowestPrice;
                            }
                          }
                        }

                        // Only add to vendorGrandTotal if we found a valid vendor price
                        // Don't fall back to BOQ price for grand total calculation
                        if (vendorPrice > 0) {
                          vendorGrandTotal += vendorPrice * material.quantity;
                          materialsWithPricesCount++; // Increment count
                        }
                      });

                      const totalDiff = vendorGrandTotal - boqGrandTotal;
                      const isOverBudget = totalDiff > 0;

                      // Only show Estimated Total if there are multiple materials with vendor prices
                      if (vendorGrandTotal > 0 && materialsWithPricesCount > 1) {
                        return (
                          <div className="mt-3 pt-3 border-t border-green-300">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-semibold text-green-900">Estimated Total:</span>
                              <span className="text-lg font-bold text-green-700">{CURRENCY_CODE} {vendorGrandTotal.toFixed(2)}</span>
                            </div>
                            {boqGrandTotal > 0 && (
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-gray-600">BOQ Total:</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-gray-600">{CURRENCY_CODE} {boqGrandTotal.toFixed(2)}</span>
                                  {totalDiff !== 0 && (
                                    <span className={`font-semibold ${isOverBudget ? 'text-red-600' : 'text-green-600'}`}>
                                      ({isOverBudget ? '+' : ''}{totalDiff.toFixed(2)} {isOverBudget ? 'Over' : 'Under'})
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      }
                      return null;
                    })()}

                    {/* Project & BOQ Info */}
                    <div className="mt-3 pt-3 border-t border-green-300">
                      <div className="text-xs text-green-900 space-y-1">
                        <div><span className="font-medium">Project:</span> {purchase.project_name} ({purchase.project_code})</div>
                        <div><span className="font-medium">BOQ:</span> {purchase.boq_name}</div>
                        <div><span className="font-medium">Item:</span> {purchase.item_name}</div>
                      </div>
                    </div>
                  </div>
                )}

              {/* LPO PDF Section - Only for Buyer mode */}
              {viewMode === 'buyer' && (
                <div className="mt-4 bg-white border border-gray-200 rounded-lg p-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <FileText className="w-5 h-5 text-blue-600" />
                        <div>
                          <span className="text-sm font-medium text-gray-900">LPO PDF (Mandatory)</span>
                          <p className="text-xs text-gray-500">Local Purchase Order PDF will be automatically generated and attached</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (!lpoData && !isLoadingLpo) {
                              loadLpoData();
                            }
                            setShowLpoEditor(!showLpoEditor);
                          }}
                          className="text-xs"
                          disabled={isLoadingLpo || hasTdApprovedAnyPO}
                          title={hasTdApprovedAnyPO ? "Cannot edit - TD has already approved this purchase order" : "Edit LPO details"}
                        >
                          {isLoadingLpo ? (
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          ) : (
                            <Edit3 className="w-3 h-3 mr-1" />
                          )}
                          {showLpoEditor ? 'Hide' : 'Edit'}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleDownloadLpoPdf}
                          className="text-xs"
                          disabled={!lpoData || isLoadingLpo}
                        >
                          <Download className="w-3 h-3 mr-1" />
                          Preview
                        </Button>
                      </div>
                    </div>
                    {isLoadingLpo && (
                      <div className="mt-3 flex items-center gap-2 text-sm text-blue-600">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading LPO data...
                      </div>
                    )}

                    {/* LPO Editor Section */}
                    {showLpoEditor && !lpoData && !isLoadingLpo && (
                      <div className="mt-4 p-4 border-t border-blue-200 text-center">
                        <p className="text-sm text-gray-500">Failed to load LPO data. Please try again.</p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={loadLpoData}
                          className="mt-2"
                        >
                          Retry
                        </Button>
                      </div>
                    )}
                    {lpoData && showLpoEditor && (
                      <div className="mt-4 space-y-4 border-t border-blue-200 pt-4">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium text-gray-700">Edit LPO Details</div>
                          <div className="flex items-center gap-3">
                            <div className="text-xs text-gray-500 flex items-center gap-1">
                              {isSavingLpo ? (
                                <>
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  <span>Saving...</span>
                                </>
                              ) : lpoLastSaved ? (
                                <>
                                  <CheckCircle className="w-3 h-3 text-green-500" />
                                  <span>Saved</span>
                                </>
                              ) : null}
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={handleSaveAsDefault}
                              disabled={isSavingDefault}
                              className="text-xs bg-purple-50 border-purple-200 hover:bg-purple-100 text-purple-700"
                            >
                              {isSavingDefault ? (
                                <>
                                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                  Saving...
                                </>
                              ) : (
                                <>
                                  <Save className="w-3 h-3 mr-1" />
                                  Save as Default
                                </>
                              )}
                            </Button>
                          </div>
                        </div>

                        {/* Quotation Ref and Subject */}
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs font-medium text-gray-600">Quotation Ref#</label>
                            <Input
                              value={lpoData.lpo_info.quotation_ref || ''}
                              onChange={(e) => setLpoData({
                                ...lpoData,
                                lpo_info: { ...lpoData.lpo_info, quotation_ref: e.target.value }
                              })}
                              className="mt-1 text-sm"
                              placeholder="Vendor quotation reference"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-gray-600">Subject</label>
                            <Input
                              value={lpoData.vendor.subject || ''}
                              onChange={(e) => setLpoData({
                                ...lpoData,
                                vendor: { ...lpoData.vendor, subject: e.target.value }
                              })}
                              className="mt-1 text-sm"
                              placeholder="LPO subject"
                            />
                          </div>
                        </div>

                        {/* Custom Message for PDF */}
                        <div>
                          <label className="text-xs font-medium text-gray-600">LPO Message (shown in PDF)</label>
                          <textarea
                            value={lpoData.lpo_info.custom_message || ''}
                            onChange={(e) => setLpoData({
                              ...lpoData,
                              lpo_info: { ...lpoData.lpo_info, custom_message: e.target.value }
                            })}
                            className="mt-1 w-full p-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px]"
                          />
                          <p className="text-xs text-gray-400 mt-1">Edit the message that appears in the LPO PDF</p>
                        </div>

                        {/* Terms Section */}
                        <div className="border-t border-blue-200 pt-4">
                          <div className="text-sm font-medium text-gray-700 mb-3">Terms & Conditions</div>

                          {/* Delivery Terms */}
                          <div className="mb-4">
                            <label className="text-xs font-medium text-gray-600">Delivery Terms</label>
                            <Input
                              value={lpoData.terms.completion_terms || lpoData.terms.delivery_terms || ''}
                              onChange={(e) => setLpoData({
                                ...lpoData,
                                terms: { ...lpoData.terms, completion_terms: e.target.value, delivery_terms: e.target.value }
                              })}
                              className="mt-1 text-sm"
                              placeholder="e.g., 04.12.25"
                            />
                          </div>

                          {/* Payment Terms with Checkboxes */}
                          <div className="bg-gray-50 rounded-lg p-3">
                            <div className="text-xs font-medium text-gray-600 mb-2">Payment Terms (select to include in PDF)</div>

                            {/* Payment terms list */}
                            <div className="space-y-2 max-h-40 overflow-y-auto mb-3">
                              {(lpoData.terms.custom_terms || []).map((term: {text: string, selected: boolean}, index: number) => (
                                <div key={index} className="flex items-center gap-2 bg-white p-2 rounded border border-gray-200">
                                  <input
                                    type="checkbox"
                                    checked={term.selected}
                                    onChange={(e) => {
                                      const updatedTerms = [...(lpoData.terms.custom_terms || [])];
                                      updatedTerms[index] = { ...term, selected: e.target.checked };
                                      setLpoData({
                                        ...lpoData,
                                        terms: { ...lpoData.terms, custom_terms: updatedTerms }
                                      });
                                    }}
                                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                                  />
                                  {editingTermIndex === index ? (
                                    <div className="flex-1 flex gap-2">
                                      <Input
                                        value={editingTermText}
                                        onChange={(e) => setEditingTermText(e.target.value)}
                                        className="flex-1 text-xs"
                                        autoFocus
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            e.preventDefault();
                                            if (editingTermText.trim()) {
                                              const updatedTerms = [...(lpoData.terms.custom_terms || [])];
                                              updatedTerms[index] = { ...term, text: editingTermText.trim() };
                                              setLpoData({
                                                ...lpoData,
                                                terms: { ...lpoData.terms, custom_terms: updatedTerms }
                                              });
                                            }
                                            setEditingTermIndex(null);
                                            setEditingTermText('');
                                          } else if (e.key === 'Escape') {
                                            setEditingTermIndex(null);
                                            setEditingTermText('');
                                          }
                                        }}
                                      />
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                          if (editingTermText.trim()) {
                                            const updatedTerms = [...(lpoData.terms.custom_terms || [])];
                                            updatedTerms[index] = { ...term, text: editingTermText.trim() };
                                            setLpoData({
                                              ...lpoData,
                                              terms: { ...lpoData.terms, custom_terms: updatedTerms }
                                            });
                                          }
                                          setEditingTermIndex(null);
                                          setEditingTermText('');
                                        }}
                                      >
                                        <Save className="w-3 h-3" />
                                      </Button>
                                    </div>
                                  ) : (
                                    <>
                                      <span className="flex-1 text-xs text-gray-700">{term.text}</span>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingTermIndex(index);
                                          setEditingTermText(term.text);
                                        }}
                                        className="text-blue-500 hover:text-blue-700 p-1"
                                      >
                                        <Edit3 className="w-3 h-3" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const updatedTerms = (lpoData.terms.custom_terms || []).filter((_: any, i: number) => i !== index);
                                          setLpoData({
                                            ...lpoData,
                                            terms: { ...lpoData.terms, custom_terms: updatedTerms }
                                          });
                                        }}
                                        className="text-red-500 hover:text-red-700 p-1"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </>
                                  )}
                                </div>
                              ))}
                              {(!lpoData.terms.custom_terms || lpoData.terms.custom_terms.length === 0) && (
                                <div className="text-xs text-gray-400 italic py-2">No payment terms added yet.</div>
                              )}
                            </div>

                            {/* Add new payment term */}
                            <div className="flex gap-2">
                              <Input
                                value={newCustomTerm}
                                onChange={(e) => setNewCustomTerm(e.target.value)}
                                placeholder="e.g., 50% Advance, 100% CDC after delivery..."
                                className="flex-1 text-sm"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    if (newCustomTerm.trim()) {
                                      const currentTerms = lpoData.terms.custom_terms || [];
                                      setLpoData({
                                        ...lpoData,
                                        terms: {
                                          ...lpoData.terms,
                                          custom_terms: [...currentTerms, { text: newCustomTerm.trim(), selected: true }]
                                        }
                                      });
                                      setNewCustomTerm('');
                                    }
                                  }
                                }}
                              />
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  if (newCustomTerm.trim()) {
                                    const currentTerms = lpoData.terms.custom_terms || [];
                                    setLpoData({
                                      ...lpoData,
                                      terms: {
                                        ...lpoData.terms,
                                        custom_terms: [...currentTerms, { text: newCustomTerm.trim(), selected: true }]
                                      }
                                    });
                                    setNewCustomTerm('');
                                  }
                                }}
                              >
                                <Plus className="w-3 h-3 mr-1" /> Add
                              </Button>
                            </div>
                          </div>
                        </div>

                        {/* Signature Selection */}
                        <div className="border-t border-blue-200 pt-4">
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              id="include-signatures-vendor"
                              checked={includeSignatures}
                              onChange={(e) => setIncludeSignatures(e.target.checked)}
                              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                            />
                            <label htmlFor="include-signatures-vendor" className="text-sm font-medium text-gray-700">
                              Include Signatures in LPO PDF
                            </label>
                          </div>

                          {includeSignatures && (
                            <div className="mt-3 bg-gray-50 p-3 rounded border border-gray-200">
                              <div className="text-xs text-gray-500 mb-2">Signatures from Admin Settings:</div>
                              <div className="grid grid-cols-3 gap-4">
                                <div className="text-center">
                                  <div className="text-xs text-gray-500 mb-1">MD Signature</div>
                                  {lpoData.signatures.md_signature ? (
                                    <img src={lpoData.signatures.md_signature} alt="MD" className="h-10 mx-auto object-contain" />
                                  ) : (
                                    <div className="text-xs text-orange-500">Not uploaded</div>
                                  )}
                                </div>
                                <div className="text-center">
                                  <div className="text-xs text-gray-500 mb-1">Stamp</div>
                                  {lpoData.signatures.stamp_image ? (
                                    <img src={lpoData.signatures.stamp_image} alt="Stamp" className="h-10 mx-auto object-contain" />
                                  ) : (
                                    <div className="text-xs text-orange-500">Not uploaded</div>
                                  )}
                                </div>
                                <div className="text-center">
                                  <div className="text-xs text-gray-500 mb-1">TD Signature</div>
                                  {lpoData.signatures.td_signature ? (
                                    <img src={lpoData.signatures.td_signature} alt="TD" className="h-10 mx-auto object-contain" />
                                  ) : (
                                    <div className="text-xs text-orange-500">Not uploaded</div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                      </div>
                    )}
                  </div>
                </div>
              )}
              </div>

              {/* Footer */}
              <div className="shrink-0 bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-between gap-4">
                <div className="text-sm text-gray-600">
                  {viewMode === 'td' ? (
                    // TD Mode: Simplified status
                    allMaterialsHaveVendors ? (
                      <span className="font-medium text-purple-600">
                        ✓ All materials have vendors assigned - Ready to apply changes
                      </span>
                    ) : selectedCount > 0 ? (
                      <span className="font-medium text-purple-600">
                        {selectedCount}/{materialVendors.length} materials with vendors selected
                      </span>
                    ) : (
                      <span className="font-medium text-orange-600">
                        Select vendors for materials to change
                      </span>
                    )
                  ) : (
                    // Buyer Mode: Full status with locked materials
                    lockedMaterialsCount === materialVendors.length ? (
                      <span className="font-medium text-amber-600">
                        All materials are locked - Awaiting TD approval
                      </span>
                    ) : allMaterialsHaveVendors && unlockedMaterials.length > 0 ? (
                      <span className="font-medium text-green-600">
                        ✓ All materials have vendors selected
                        {lockedMaterialsCount > 0 && (
                          <span className="text-amber-600 ml-2">
                            ({lockedMaterialsCount} locked)
                          </span>
                        )}
                      </span>
                    ) : selectedCount > 0 ? (
                      <span className="font-medium text-blue-600">
                        {selectedCount}/{unlockedMaterials.length} materials selected
                        {lockedMaterialsCount > 0 && (
                          <span className="text-amber-600 ml-2">
                            • {lockedMaterialsCount} locked
                          </span>
                        )}
                      </span>
                    ) : lockedMaterialsCount > 0 ? (
                      <span className="font-medium text-amber-600">
                        {lockedMaterialsCount} material{lockedMaterialsCount > 1 ? 's' : ''} locked • Select vendors for remaining
                      </span>
                    ) : (
                      <span className="font-medium text-orange-600">
                        Select at least one vendor to continue
                      </span>
                    )
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 items-center">
                  <Button
                    onClick={onClose}
                    variant="outline"
                    className="px-6"
                  >
                    Cancel
                  </Button>

                  {/* TD Mode: Simple Apply Changes button */}
                  {viewMode === 'td' ? (
                    <Button
                      onClick={() => {
                        // For TD mode, just save the vendor selection changes
                        handleSubmit();
                      }}
                      disabled={selectedCount === 0 || isSubmitting}
                      className="px-6 bg-purple-600 hover:bg-purple-700 text-white"
                    >
                      {isSubmitting ? (
                        <>
                          <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Applying Changes...
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Apply Vendor Changes
                        </>
                      )}
                    </Button>
                  ) : (
                    /* Buyer Mode: Submit All Together - Single Purchase Indicator */
                    /* Hide this button if: 1) purchase is already split, OR 2) multiple unique vendors are selected */
                    /* User should use individual "Send This Vendor to TD" buttons when there are multiple vendors */
                    !isPurchaseAlreadySplit && !hasMultipleUniqueVendors && selectedCount > 0 && (
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-xs text-gray-500 italic">
                          Send all materials as one purchase
                        </span>
                        <Button
                          onClick={() => {
                            setSendSeparately(false);
                            handleSubmit();
                          }}
                          disabled={selectedCount === 0 || isSubmitting}
                          className="px-6 bg-blue-600 hover:bg-blue-700 text-white"
                        >
                          {isSubmitting && !sendSeparately ? (
                            <>
                              <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              {isTechnicalDirector ? 'Approving...' : 'Submitting...'}
                            </>
                          ) : (
                            <>
                              <CheckCircle className="w-4 h-4 mr-2" />
                              {isTechnicalDirector ? 'Approve All' : 'Submit for TD Approval'}
                            </>
                          )}
                        </Button>
                      </div>
                    )
                  )}
                </div>
              </div>
            </motion.div>
          </div>

          {/* Confirmation Dialog */}
          <AnimatePresence>
            {showConfirmation && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]"
                  onClick={() => setShowConfirmation(false)}
                />
                <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Confirmation Header */}
                    <div className="bg-gradient-to-r from-blue-50 to-blue-100 px-6 py-4 border-b border-blue-200">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-500 rounded-full">
                          <AlertCircle className="w-5 h-5 text-white" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-900">Confirm Vendor Selections</h3>
                      </div>
                    </div>

                    {/* Confirmation Body */}
                    <div className="px-6 py-5">
                      <p className="text-gray-700 mb-4">
                        You have selected <span className="font-semibold text-gray-900">{totalVendorSelections} vendor(s)</span> for <span className="font-semibold text-gray-900">{selectedCount} material(s)</span>.
                      </p>
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                        <p className="text-sm text-blue-900">
                          <AlertCircle className="w-4 h-4 inline mr-1.5" />
                          {isTechnicalDirector ? (
                            <>These selections will be <span className="font-semibold">approved</span> immediately with project and BOQ details.</>
                          ) : (
                            <>These selections will be sent to the <span className="font-semibold">Technical Director</span> for approval with full project context.</>
                          )}
                        </p>
                      </div>

                      {/* Summary of selections */}
                      <div className="max-h-60 overflow-y-auto space-y-2">
                        {materialVendors.filter(m => m.selected_vendors.length > 0).map((m, idx) => (
                          <div key={idx} className="text-xs bg-gray-50 rounded p-2">
                            <div className="font-medium text-gray-900 mb-1 flex items-center justify-between">
                              <span>{m.material_name}</span>
                              <Badge className="text-[10px]">{m.selection_mode}</Badge>
                            </div>
                            {m.selected_vendors.map((v, vIdx) => (
                              <div key={vIdx} className="flex items-center justify-between text-gray-700 pl-3">
                                <span>→ {v.vendor_name}</span>
                                {v.send_individually && (
                                  <Badge className="bg-purple-100 text-purple-800 text-[9px]">
                                    Separate PO
                                  </Badge>
                                )}
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>

                      {/* Project Info */}
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <div className="text-xs text-gray-600 space-y-1">
                          <div><span className="font-medium">Project:</span> {purchase.project_name}</div>
                          <div><span className="font-medium">BOQ:</span> {purchase.boq_name}</div>
                        </div>
                      </div>
                    </div>

                    {/* Confirmation Footer */}
                    <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
                      <Button
                        onClick={() => setShowConfirmation(false)}
                        variant="outline"
                        className="px-6"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleConfirmSelection}
                        className="px-6 bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        {isTechnicalDirector ? 'Confirm & Approve' : 'Confirm & Submit'}
                      </Button>
                    </div>
                  </motion.div>
                </div>
              </>
            )}
          </AnimatePresence>

          {/* Vendor Send Confirmation Dialog */}
          <AnimatePresence>
            {vendorSendConfirmation && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]"
                  onClick={() => setVendorSendConfirmation(null)}
                />
                <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Header */}
                    <div className="bg-gradient-to-r from-amber-50 to-orange-100 px-6 py-4 border-b border-amber-200">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-500 rounded-full">
                          <AlertCircle className="w-5 h-5 text-white" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-900">Confirm Before Sending</h3>
                      </div>
                    </div>

                    {/* Body */}
                    <div className="px-6 py-5">
                      {/* Warning Message */}
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                        <p className="text-sm text-amber-900 font-medium flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                          <span>Please verify all materials are correct. Once sent, you cannot modify this submission.</span>
                        </p>
                      </div>

                      {/* Vendor Info */}
                      <div className="mb-4">
                        <div className="text-xs text-gray-500 mb-1">Sending to Vendor</div>
                        <div className="font-bold text-gray-900 text-lg flex items-center gap-2">
                          <Store className="w-5 h-5 text-blue-600" />
                          {vendorSendConfirmation.vendor_name}
                        </div>
                      </div>

                      {/* Materials List */}
                      <div className="mb-4">
                        <div className="text-xs text-gray-500 mb-2">Materials to be sent ({vendorSendConfirmation.materials.length})</div>
                        <div className="max-h-40 overflow-y-auto space-y-2 border border-gray-200 rounded-lg p-2">
                          {vendorSendConfirmation.materials.map((mat, idx) => (
                            <div key={idx} className="bg-gray-50 rounded px-3 py-2 text-sm">
                              <div className="font-medium text-gray-900">{mat.material_name}</div>
                              <div className="text-xs text-gray-500">{mat.quantity} {mat.unit}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Info about adding more materials later */}
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <p className="text-xs text-blue-800">
                          <strong>Note:</strong> If you need to add more materials for this vendor later, you can create a new submission (will get a new CR number like .2, .3, etc.)
                        </p>
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
                      <Button
                        onClick={() => setVendorSendConfirmation(null)}
                        variant="outline"
                        className="px-6"
                      >
                        Review Again
                      </Button>
                      <Button
                        onClick={async () => {
                          // Actually send the vendor to TD
                          try {
                            setIsSubmitting(true);

                            const sentVendorId = vendorSendConfirmation.vendor_id;
                            const sentVendorName = vendorSendConfirmation.vendor_name;

                            const materials = materialVendors
                              .filter(m => m.selected_vendors.length > 0)
                              .filter(m => m.selected_vendors[0].vendor_id === sentVendorId)
                              .filter(m => !isMaterialActuallyLocked(m.material_name)) // Only unlocked materials
                              .map(m => ({
                                material_name: m.material_name,
                                quantity: m.quantity,
                                unit: m.unit,
                                negotiated_price: m.selected_vendors[0].negotiated_price,
                                save_price_for_future: m.selected_vendors[0].save_price_for_future
                              }));

                            if (materials.length === 0) {
                              toast.error('No materials to send for this vendor');
                              setVendorSendConfirmation(null);
                              return;
                            }

                            const submissionGroupId = `${Date.now()}-${Math.random().toString(36).slice(2, 2 + SUBMISSION_ID_LENGTH)}`;

                            const response = await buyerService.createPOChildren(
                              purchase.cr_id,
                              [{
                                vendor_id: sentVendorId,
                                vendor_name: sentVendorName,
                                materials: materials
                              }],
                              submissionGroupId
                            );

                            // Show success immediately
                            toast.success(response.message || `Sent to TD for approval: ${sentVendorName}!`);

                            if (response.po_children && response.po_children.length > 0) {
                              toast.info(`Purchase Order: ${response.po_children[0].formatted_id}`, { duration: 5000 });

                              // Optimistically update purchase.po_children locally for immediate UI feedback
                              const newPOChild = {
                                id: response.po_children[0].id,
                                parent_cr_id: purchase.cr_id,
                                formatted_id: response.po_children[0].formatted_id,
                                suffix: `.${(purchase.po_children?.length || 0) + 1}`,
                                vendor_id: sentVendorId,
                                vendor_name: sentVendorName,
                                vendor_selection_status: 'pending_td_approval' as const,
                                status: 'pending_td_approval' as const,
                                materials: materials.map(m => ({
                                  material_name: m.material_name,
                                  quantity: m.quantity,
                                  unit: m.unit,
                                  unit_price: m.negotiated_price || 0,
                                  total_price: (m.negotiated_price || 0) * m.quantity
                                }))
                              };

                              // Update the purchase object's po_children array
                              if (!purchase.po_children) {
                                purchase.po_children = [];
                              }
                              purchase.po_children.push(newPOChild);
                            }

                            // Mark this vendor as sent (updates UI immediately)
                            setSentVendorIds(prev => new Set([...prev, sentVendorId]));

                            // Close confirmation dialog first (UI stays responsive)
                            setVendorSendConfirmation(null);
                            setIsSubmitting(false);

                            // Lazy refresh data in background (doesn't block UI)
                            setTimeout(() => {
                              onVendorSelected?.();
                            }, 500);

                          } catch (error: any) {
                            console.error('Error creating sub-CR:', error);
                            toast.error(error.message || 'Failed to create purchase order');
                            setIsSubmitting(false);
                          }
                        }}
                        disabled={isSubmitting}
                        className="px-6 bg-green-600 hover:bg-green-700 text-white"
                      >
                        {isSubmitting ? (
                          <>
                            <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Sending...
                          </>
                        ) : (
                          <>
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Confirm & Send to TD
                          </>
                        )}
                      </Button>
                    </div>
                  </motion.div>
                </div>
              </>
            )}
          </AnimatePresence>
        </>
      )}
    </AnimatePresence>
  );
};

export default React.memo(MaterialVendorSelectionModal);
