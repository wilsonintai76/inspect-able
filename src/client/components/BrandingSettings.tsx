import React, { useState, useEffect } from 'react';
import { Upload, RefreshCw, CheckCircle, AlertCircle, Image as ImageIcon, Trash2 } from 'lucide-react';
import { BRANDING, DEFAULT_BRANDING } from '../constants';
import { gateway } from '../services/dataGateway';

interface BrandingSettingsProps {
  showToast?: (message: string, type?: any) => void;
}

export const BrandingSettings: React.FC<BrandingSettingsProps> = ({ showToast }) => {
  const [logoBrand, setLogoBrand] = useState<string>(BRANDING.logoBrand);
  const [logoInstitution, setLogoInstitution] = useState<string>(BRANDING.logoInstitution);
  const [isUploadingBrand, setIsUploadingBrand] = useState(false);
  const [isUploadingInst, setIsUploadingInst] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Load initial settings on mount
  useEffect(() => {
    const fetchBranding = async () => {
      try {
        const settings = await gateway.getSystemSettings();
        const brandingSetting = settings.find(s => s.id === 'branding');
        if (brandingSetting?.value) {
          const val = brandingSetting.value as any;
          if (val.logoBrand) {
            setLogoBrand(val.logoBrand);
          } else if (val.logoHorizontal || val.logoSquare) {
            setLogoBrand(val.logoHorizontal || val.logoSquare);
          }
          if (val.logoInstitution) setLogoInstitution(val.logoInstitution);
        }
      } catch (err) {
        console.error('Failed to fetch dynamic branding settings:', err);
      }
    };
    fetchBranding();
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'logoBrand' | 'logoInstitution') => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type
    if (!file.type.startsWith('image/')) {
      if (showToast) showToast('Please upload an image file.', 'error');
      return;
    }

    const setUploading = type === 'logoBrand' ? setIsUploadingBrand : setIsUploadingInst;
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      // Import auth headers
      const { getAuthHeaders } = await import('../services/honoClient');
      const headers = await getAuthHeaders();

      const response = await fetch('/api/media/upload', {
        method: 'POST',
        headers: {
          ...headers,
        },
        body: formData
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const data = (await response.json()) as any;
      if (type === 'logoBrand') {
        setLogoBrand(data.url);
      } else {
        setLogoInstitution(data.url);
      }

      if (showToast) showToast('Logo uploaded successfully. Make sure to click Save to apply changes!', 'success');
    } catch (err: any) {
      console.error(err);
      if (showToast) showToast(err.message || 'Failed to upload logo to R2', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const newBranding = {
        logoBrand,
        logoInstitution
      };

      await gateway.updateSystemSetting('branding', newBranding);

      // Immediately apply to mutable BRANDING object in memory
      BRANDING.logoBrand = logoBrand;
      BRANDING.logoInstitution = logoInstitution;

      if (showToast) showToast('Institutional branding settings updated successfully!', 'success');
    } catch (err: any) {
      console.error(err);
      if (showToast) showToast('Failed to save branding settings.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (window.confirm('Are you sure you want to restore default branding? This will remove custom uploaded logos.')) {
      setIsSaving(true);
      try {
        const defaultBrand = DEFAULT_BRANDING.logoBrand;
        const defaultInst = DEFAULT_BRANDING.logoInstitution;

        // Delete from system_settings or save default values
        await gateway.updateSystemSetting('branding', {
          logoBrand: defaultBrand,
          logoInstitution: defaultInst
        });

        // Apply globally
        BRANDING.logoBrand = defaultBrand;
        BRANDING.logoInstitution = defaultInst;

        setLogoBrand(defaultBrand);
        setLogoInstitution(defaultInst);

        if (showToast) showToast('Branding restored to default successfully!', 'success');
      } catch (err) {
        console.error(err);
        if (showToast) showToast('Failed to reset branding settings.', 'error');
      } finally {
        setIsSaving(false);
      }
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden mb-8">
      <div className="p-8 border-b border-slate-100 bg-slate-50/50">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-600/20">
            <ImageIcon className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-black text-slate-900 tracking-tight">Institutional Branding</h3>
            <p className="text-slate-500 text-xs font-semibold">Customize logos served dynamically from Cloudflare R2 and stored persistently.</p>
          </div>
        </div>
      </div>

      <div className="p-8 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Brand Logo */}
          <div className="rounded-2xl border border-slate-200 p-6 hover:border-indigo-600/30 transition-all flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Brand Logo</h4>
                  <p className="text-[10px] text-slate-500">Used in landing page header navigation, sidebar menus, mobile layouts, and favicons.</p>
                </div>
              </div>

              {/* Logo Preview Container */}
              <div className="w-full h-32 bg-slate-50 border border-slate-100 rounded-xl mb-4 flex items-center justify-center overflow-hidden p-4">
                {logoBrand ? (
                  <img src={logoBrand} alt="Brand Logo Preview" className="max-w-full max-h-full object-contain" />
                ) : (
                  <span className="text-xs text-slate-400">No Image Uploaded</span>
                )}
              </div>
            </div>

            <div>
              <label className="relative cursor-pointer w-full py-2.5 bg-white border border-slate-200 text-slate-700 hover:border-indigo-600 hover:text-indigo-600 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all">
                {isUploadingBrand ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {isUploadingBrand ? 'Uploading...' : 'Upload Image'}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleUpload(e, 'logoBrand')}
                  className="hidden"
                  disabled={isUploadingBrand}
                />
              </label>
            </div>
          </div>

          {/* Institution Logo */}
          <div className="rounded-2xl border border-slate-200 p-6 hover:border-indigo-600/30 transition-all flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Institution Logo</h4>
                  <p className="text-[10px] text-slate-500">Used for footer branding, certificates copyright, and reports header.</p>
                </div>
              </div>

              {/* Logo Preview Container */}
              <div className="w-full h-32 bg-slate-50 border border-slate-100 rounded-xl mb-4 flex items-center justify-center overflow-hidden p-4">
                {logoInstitution ? (
                  <img src={logoInstitution} alt="Institution Logo Preview" className="max-w-full max-h-full object-contain" />
                ) : (
                  <span className="text-xs text-slate-400">No Image Uploaded</span>
                )}
              </div>
            </div>

            <div>
              <label className="relative cursor-pointer w-full py-2.5 bg-white border border-slate-200 text-slate-700 hover:border-indigo-600 hover:text-indigo-600 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all">
                {isUploadingInst ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {isUploadingInst ? 'Uploading...' : 'Upload Image'}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleUpload(e, 'logoInstitution')}
                  className="hidden"
                  disabled={isUploadingInst}
                />
              </label>
            </div>
          </div>
        </div>

        {/* Global actions */}
        <div className="flex items-center justify-between border-t border-slate-100 pt-6">
          <button
            onClick={handleReset}
            disabled={isSaving}
            className="px-5 py-2.5 text-xs font-bold text-red-600 border border-red-200 hover:bg-red-50 rounded-xl flex items-center gap-2 transition-all disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            Reset to Defaults
          </button>
          
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-2.5 text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl flex items-center gap-2 shadow-lg shadow-indigo-600/10 transition-all disabled:opacity-50"
          >
            {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Save Branding Changes
          </button>
        </div>
      </div>
    </div>
  );
};
