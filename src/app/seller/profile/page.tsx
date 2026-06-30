'use client'

import { useSellerAuth } from '@/hooks/use-seller-auth'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { fmtPrice } from '@/lib/currency'
import {
  User,
  Store,
  Building2,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Clock,
  FileText,
  Star,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  CheckCircle2,
  XCircle,
  Package,
  ShoppingCart,
  IndianRupee,
  TrendingUp,
  CreditCard,
  FileCheck,
  FileUp,
  Eye,
  ArrowUpRight,
  Settings,
  Edit3,
  Copy,
  Check,
  Info,
  BadgeCheck,
  Landmark,
  Hash,
  Globe,
  ChevronRight,
  X,
  Save,
  Loader2,
  Upload,
  Trash2,
  Camera,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import Link from 'next/link'

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

interface DocumentInfo {
  url: string
  publicId: string
  uploadedAt: string
  verified: boolean
  verifiedAt: string | null
  verifiedBy: string | null
  rejectionReason: string | null
}

interface VerificationNote {
  note: string
  addedBy: string
  addedAt: string
  type: string
}

interface SellerProfile {
  _id: string
  name: string
  email: string
  storeName: string
  phone: string
  address: string | null
  gstNumber: string
  panNumber: string
  businessType: string
  bankDetails: {
    accountName: string
    accountNumber: string
    ifsc: string
    bankName: string
    verified?: boolean
  } | null
  pickupAddress: {
    fullName: string
    phone: string
    addressLine1: string
    addressLine2: string
    city: string
    state: string
    pincode: string
  } | null
  documents?: {
    gst_certificate?: DocumentInfo
    pan_card?: DocumentInfo
    cancel_cheque?: DocumentInfo
    business_registration?: DocumentInfo
    address_proof?: DocumentInfo
  }
  profileImage?: { url: string; publicId: string } | null
  coverImage?: { url: string; publicId: string } | null
  verificationStatus: 'pending' | 'verified' | 'rejected' | 'resubmission_requested' | 'in_review'
  verificationNotes: VerificationNote[]
  role: string
  isVerified: boolean
  status: string
  createdAt: string | null
  updatedAt: string | null
  lastLoginAt: string | null
}

interface ProfileStats {
  totalProducts: number
  activeProducts: number
  totalOrders: number
  deliveredOrders: number
  totalRevenue: number
  averageRating: number
  totalReviews: number
  memberDays: number
  documentsCompletion: number
}

/* ------------------------------------------------------------------ */
/*  Constants                                                           */
/* ------------------------------------------------------------------ */

const DOC_LABELS: Record<string, string> = {
  pan_card: 'PAN Card',
  cancel_cheque: 'Cancel Cheque',
  gst_certificate: 'GST Certificate',
  business_registration: 'Business Registration',
  address_proof: 'Address Proof',
}

const DOC_TYPES = Object.keys(DOC_LABELS)

const BUSINESS_TYPE_LABELS: Record<string, string> = {
  individual: 'Individual',
  proprietorship: 'Sole Proprietorship',
  partnership: 'Partnership',
  llp: 'Limited Liability Partnership',
  pvt_ltd: 'Private Limited Company',
  other: 'Other',
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.08 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '\u2014'
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return '\u2014'
  }
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '\u2014'
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '\u2014'
  }
}

function formatMemberSince(days: number): string {
  if (days < 1) return 'Today'
  if (days === 1) return '1 day'
  if (days < 30) return `${days} days`
  if (days < 365) {
    const months = Math.floor(days / 30)
    return months === 1 ? '1 month' : `${months} months`
  }
  const years = Math.floor(days / 365)
  const remainingMonths = Math.floor((days % 365) / 30)
  if (remainingMonths === 0) return years === 1 ? '1 year' : `${years} years`
  return `${years}y ${remainingMonths}m`
}

function maskAccountNumber(accNum: string): string {
  if (!accNum) return '\u2014'
  const len = accNum.length
  if (len <= 4) return '****'
  return '****' + accNum.slice(-4)
}

/* ------------------------------------------------------------------ */
/*  Skeleton Loader                                                     */
/* ------------------------------------------------------------------ */

function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <Skeleton className="h-32 w-full" />
        <div className="px-6 pb-6 -mt-10">
          <div className="flex items-end gap-4">
            <Skeleton className="h-20 w-20 rounded-2xl border-4 border-card" />
            <div className="space-y-2 pb-1">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-28 bg-muted animate-pulse rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-card rounded-xl border border-border p-6 space-y-4">
            <Skeleton className="h-6 w-40" />
            {[1, 2, 3].map(j => (
              <div key={j} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-5 w-full" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Copy Button                                                         */
/* ------------------------------------------------------------------ */

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  const { toast } = useToast()

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast({ title: 'Copied', description: `${label} copied to clipboard` })
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast({ title: 'Failed to copy', variant: 'destructive' })
    }
  }

  return (
    <button
      onClick={handleCopy}
      className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
      title={`Copy ${label}`}
    >
      {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/*  Edit Personal Info Dialog                                            */
/* ------------------------------------------------------------------ */

function EditPersonalInfoDialog({
  open,
  onOpenChange,
  profile,
  onSave,
  saving,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  profile: SellerProfile
  onSave: (data: { name: string; phone: string; address: string }) => Promise<void>
  saving: boolean
}) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')

  // Reset form when dialog opens
  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (nextOpen) {
      setName(profile.name || '')
      setPhone(profile.phone || '')
      setAddress(typeof profile.address === 'string' ? profile.address : '')
    }
    onOpenChange(nextOpen)
  }, [profile, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            Edit Personal Information
          </DialogTitle>
          <DialogDescription>Update your contact details and address</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="edit-name" className="text-sm font-medium">Full Name</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
              <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter your full name" className="pl-9" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-phone" className="text-sm font-medium">Phone Number</Label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
              <Input id="edit-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Enter your phone number" className="pl-9" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-address" className="text-sm font-medium">Business Address</Label>
            <div className="relative">
              <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground/50" />
              <Textarea id="edit-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Enter your business address" className="pl-9 min-h-[80px] resize-none" rows={3} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={() => onSave({ name: name.trim(), phone: phone.trim(), address: address.trim() })} disabled={saving || !name.trim()} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/*  Edit Business Details Dialog                                         */
/* ------------------------------------------------------------------ */

function EditBusinessDetailsDialog({
  open,
  onOpenChange,
  profile,
  onSave,
  saving,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  profile: SellerProfile
  onSave: (data: { gstNumber: string; panNumber: string }) => Promise<void>
  saving: boolean
}) {
  const [gstNumber, setGstNumber] = useState('')
  const [panNumber, setPanNumber] = useState('')

  // Reset form when dialog opens
  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (nextOpen) {
      setGstNumber(profile.gstNumber || '')
      setPanNumber(profile.panNumber || '')
    }
    onOpenChange(nextOpen)
  }, [profile, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            Edit Business Details
          </DialogTitle>
          <DialogDescription>Update your tax and compliance information</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="edit-gst" className="text-sm font-medium">GST Number</Label>
            <div className="relative">
              <FileText className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
              <Input id="edit-gst" type="text" value={gstNumber} onChange={(e) => setGstNumber(e.target.value.toUpperCase())} placeholder="e.g. 22AAAAA0000A1Z5" className="pl-9 uppercase" maxLength={15} />
            </div>
            <p className="text-[11px] text-muted-foreground">15-digit GST Identification Number (GSTIN)</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-pan" className="text-sm font-medium">PAN Number</Label>
            <div className="relative">
              <FileText className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
              <Input id="edit-pan" type="text" value={panNumber} onChange={(e) => setPanNumber(e.target.value.toUpperCase())} placeholder="e.g. AAAAA0000A" className="pl-9 uppercase" maxLength={10} />
            </div>
            <p className="text-[11px] text-muted-foreground">10-character alphanumeric Permanent Account Number</p>
          </div>
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30">
            <Info className="h-4 w-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-emerald-700 dark:text-emerald-300 leading-relaxed">
              These details are used for verification and tax compliance. Ensure the information matches your official documents.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={() => onSave({ gstNumber: gstNumber.trim(), panNumber: panNumber.trim() })} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/*  Edit Bank Details Dialog                                             */
/* ------------------------------------------------------------------ */

function EditBankDetailsDialog({
  open,
  onOpenChange,
  profile,
  onSave,
  saving,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  profile: SellerProfile
  onSave: (data: { accountName: string; accountNumber: string; ifsc: string; bankName: string }) => Promise<void>
  saving: boolean
}) {
  const [accountName, setAccountName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [ifsc, setIfsc] = useState('')
  const [bankName, setBankName] = useState('')

  // Reset form when dialog opens
  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (nextOpen) {
      setAccountName(profile.bankDetails?.accountName || '')
      setAccountNumber(profile.bankDetails?.accountNumber || '')
      setIfsc(profile.bankDetails?.ifsc || '')
      setBankName(profile.bankDetails?.bankName || '')
    }
    onOpenChange(nextOpen)
  }, [profile, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Landmark className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            Edit Bank Details
          </DialogTitle>
          <DialogDescription>Update your bank account information for receiving payouts</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="edit-acc-name" className="text-sm font-medium">Account Holder Name</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
              <Input id="edit-acc-name" value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="Name as per bank records" className="pl-9" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-acc-num" className="text-sm font-medium">Account Number</Label>
            <div className="relative">
              <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
              <Input id="edit-acc-num" type="text" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="Enter account number" className="pl-9" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="edit-ifsc" className="text-sm font-medium">IFSC Code</Label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                <Input id="edit-ifsc" type="text" value={ifsc} onChange={(e) => setIfsc(e.target.value.toUpperCase())} placeholder="IFSC code" className="pl-9 uppercase" maxLength={11} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-bank" className="text-sm font-medium">Bank Name</Label>
              <div className="relative">
                <Landmark className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                <Input id="edit-bank" type="text" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Bank name" className="pl-9" />
              </div>
            </div>
          </div>
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-50/50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30">
            <Info className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
              Bank account changes may require re-verification. Please ensure the details are accurate.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={() => onSave({ accountName: accountName.trim(), accountNumber: accountNumber.trim(), ifsc: ifsc.trim(), bankName: bankName.trim() })} disabled={saving || !accountName.trim() || !accountNumber.trim() || !ifsc.trim() || !bankName.trim()} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/*  Edit Pickup Address Dialog                                           */
/* ------------------------------------------------------------------ */

function EditPickupAddressDialog({
  open,
  onOpenChange,
  profile,
  onSave,
  saving,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  profile: SellerProfile
  onSave: (data: { fullName: string; phone: string; addressLine1: string; addressLine2: string; city: string; state: string; pincode: string }) => Promise<void>
  saving: boolean
}) {
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [addressLine1, setAddressLine1] = useState('')
  const [addressLine2, setAddressLine2] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [pincode, setPincode] = useState('')

  // Reset form when dialog opens
  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (nextOpen) {
      setFullName(profile.pickupAddress?.fullName || '')
      setPhone(profile.pickupAddress?.phone || '')
      setAddressLine1(profile.pickupAddress?.addressLine1 || '')
      setAddressLine2(profile.pickupAddress?.addressLine2 || '')
      setCity(profile.pickupAddress?.city || '')
      setState(profile.pickupAddress?.state || '')
      setPincode(profile.pickupAddress?.pincode || '')
    }
    onOpenChange(nextOpen)
  }, [profile, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            Edit Pickup Address
          </DialogTitle>
          <DialogDescription>Update where orders will be picked up from</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="edit-pa-name" className="text-sm font-medium">Contact Name</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                <Input id="edit-pa-name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" className="pl-9" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-pa-phone" className="text-sm font-medium">Contact Phone</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                <Input id="edit-pa-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" className="pl-9" />
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-pa-addr1" className="text-sm font-medium">Address Line 1</Label>
            <Input id="edit-pa-addr1" value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} placeholder="House no., Building, Street" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-pa-addr2" className="text-sm font-medium">Address Line 2</Label>
            <Input id="edit-pa-addr2" value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} placeholder="Area, Colony, Landmark (optional)" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="edit-pa-city" className="text-sm font-medium">City</Label>
              <Input id="edit-pa-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-pa-state" className="text-sm font-medium">State</Label>
              <Input id="edit-pa-state" value={state} onChange={(e) => setState(e.target.value)} placeholder="State" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-pa-pin" className="text-sm font-medium">Pincode</Label>
              <Input id="edit-pa-pin" value={pincode} onChange={(e) => setPincode(e.target.value)} placeholder="Pincode" maxLength={6} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={() => onSave({ fullName: fullName.trim(), phone: phone.trim(), addressLine1: addressLine1.trim(), addressLine2: addressLine2.trim(), city: city.trim(), state: state.trim(), pincode: pincode.trim() })} disabled={saving || !fullName.trim() || !addressLine1.trim() || !city.trim() || !state.trim() || !pincode.trim()} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Address
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                      */
/* ------------------------------------------------------------------ */

export default function SellerProfilePage() {
  const { authenticated, loading, user, logout } = useSellerAuth()
  const router = useRouter()
  const { toast } = useToast()

  const [profile, setProfile] = useState<SellerProfile | null>(null)
  const [stats, setStats] = useState<ProfileStats | null>(null)
  const [loadingData, setLoadingData] = useState(true)

  // Dialog states
  const [editPersonalOpen, setEditPersonalOpen] = useState(false)
  const [editBusinessOpen, setEditBusinessOpen] = useState(false)
  const [editBankOpen, setEditBankOpen] = useState(false)
  const [editPickupOpen, setEditPickupOpen] = useState(false)
  const [savingField, setSavingField] = useState<string | null>(null)

  // Document upload state
  const [uploadingDocType, setUploadingDocType] = useState<string | null>(null)
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  // Profile image upload state
  const [uploadingProfileImage, setUploadingProfileImage] = useState(false)
  const profileImageInputRef = useRef<HTMLInputElement | null>(null)

  // Cover image upload state
  const [uploadingCoverImage, setUploadingCoverImage] = useState(false)
  const coverImageInputRef = useRef<HTMLInputElement | null>(null)

  // Handle profile image upload
  const handleProfileImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Invalid file type', description: 'Please select an image file', variant: 'destructive' })
      return
    }
    // Validate file size (3.1MB max)
    if (file.size > 3.1 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Image must be under 3.1MB', variant: 'destructive' })
      return
    }

    setUploadingProfileImage(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/seller/profile', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to upload image')
      }

      const data = await res.json()
      // Update profile state with new image
      if (profile && data.profileImage) {
        setProfile({
          ...profile,
          profileImage: { url: data.profileImage.url, publicId: data.profileImage.publicId },
        })
      }
      toast({ title: 'Profile image updated', description: 'Your profile photo has been updated successfully' })
    } catch (err) {
      toast({
        title: 'Upload failed',
        description: err instanceof Error ? err.message : 'Failed to upload profile image',
        variant: 'destructive',
      })
    } finally {
      setUploadingProfileImage(false)
      // Reset input so the same file can be selected again
      if (profileImageInputRef.current) {
        profileImageInputRef.current.value = ''
      }
    }
  }

  // Handle cover image upload
  const handleCoverImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast({ title: 'Invalid file type', description: 'Please select an image file', variant: 'destructive' })
      return
    }
    if (file.size > 3.1 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Image must be under 3.1MB', variant: 'destructive' })
      return
    }

    setUploadingCoverImage(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/seller/profile?type=cover', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to upload cover image')
      }

      const data = await res.json()
      if (profile && data.coverImage) {
        setProfile({
          ...profile,
          coverImage: { url: data.coverImage.url, publicId: data.coverImage.publicId },
        })
      }
      toast({ title: 'Cover image updated', description: 'Your cover photo has been updated successfully' })
    } catch (err) {
      toast({
        title: 'Upload failed',
        description: err instanceof Error ? err.message : 'Failed to upload cover image',
        variant: 'destructive',
      })
    } finally {
      setUploadingCoverImage(false)
      if (coverImageInputRef.current) {
        coverImageInputRef.current.value = ''
      }
    }
  }

  // Redirect if not authenticated
  useEffect(() => {
    if (!loading && !authenticated) {
      router.replace('/seller')
    }
  }, [authenticated, loading, router])

  // Fetch profile + stats
  const fetchProfileStats = useCallback(async () => {
    try {
      const res = await fetch('/api/seller/profile/stats')
      if (res.status === 401 || res.status === 403) {
        await logout()
        router.replace('/seller')
        return
      }
      if (!res.ok) throw new Error('Failed to fetch profile')
      const data = await res.json()
      setProfile(data.profile as SellerProfile)
      setStats(data.stats as ProfileStats)
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to load profile. Please refresh the page.',
        variant: 'destructive',
      })
    } finally {
      setLoadingData(false)
    }
  }, [logout, router, toast])

  useEffect(() => {
    if (authenticated) {
      fetchProfileStats()
    }
  }, [authenticated, fetchProfileStats])

  // ── Save handlers ──────────────────────────────────────────────────

  const handleSavePersonal = useCallback(async (data: { name: string; phone: string; address: string }) => {
    setSavingField('personal')
    try {
      const res = await fetch('/api/seller/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const resData = await res.json()
      if (!res.ok) throw new Error(resData.error || 'Failed to update profile')
      setProfile(resData.profile as SellerProfile)
      setEditPersonalOpen(false)
      toast({ title: 'Profile Updated', description: 'Your personal information has been saved.' })
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to update profile.', variant: 'destructive' })
    } finally {
      setSavingField(null)
    }
  }, [toast])

  const handleSaveBusiness = useCallback(async (data: { gstNumber: string; panNumber: string }) => {
    setSavingField('business')
    try {
      const res = await fetch('/api/seller/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const resData = await res.json()
      if (!res.ok) throw new Error(resData.error || 'Failed to update business details')
      setProfile(resData.profile as SellerProfile)
      setEditBusinessOpen(false)
      toast({ title: 'Business Details Updated', description: 'Your business information has been saved.' })
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to update business details.', variant: 'destructive' })
    } finally {
      setSavingField(null)
    }
  }, [toast])

  const handleSaveBank = useCallback(async (data: { accountName: string; accountNumber: string; ifsc: string; bankName: string }) => {
    setSavingField('bank')
    try {
      const res = await fetch('/api/seller/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bankDetails: data }),
      })
      const resData = await res.json()
      if (!res.ok) throw new Error(resData.error || 'Failed to update bank details')
      setProfile(resData.profile as SellerProfile)
      setEditBankOpen(false)
      toast({ title: 'Bank Details Updated', description: 'Your bank account information has been saved.' })
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to update bank details.', variant: 'destructive' })
    } finally {
      setSavingField(null)
    }
  }, [toast])

  const handleSavePickup = useCallback(async (data: { fullName: string; phone: string; addressLine1: string; addressLine2: string; city: string; state: string; pincode: string }) => {
    setSavingField('pickup')
    try {
      const res = await fetch('/api/seller/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pickupAddress: data }),
      })
      const resData = await res.json()
      if (!res.ok) throw new Error(resData.error || 'Failed to update pickup address')
      setProfile(resData.profile as SellerProfile)
      setEditPickupOpen(false)
      toast({ title: 'Pickup Address Updated', description: 'Your pickup address has been saved.' })
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to update pickup address.', variant: 'destructive' })
    } finally {
      setSavingField(null)
    }
  }, [toast])

  // ── Document upload handler ────────────────────────────────────────

  const handleDocumentUpload = useCallback(async (documentType: string, file: File) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    if (!allowedTypes.includes(file.type)) {
      toast({ title: 'Invalid File Type', description: 'Please upload a JPG, PNG, WebP, or PDF file.', variant: 'destructive' })
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'File Too Large', description: 'File size must be less than 5MB.', variant: 'destructive' })
      return
    }

    setUploadingDocType(documentType)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('documentType', documentType)

      const res = await fetch('/api/seller/documents', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to upload document')

      toast({ title: 'Document Uploaded', description: `${DOC_LABELS[documentType] || documentType} has been uploaded successfully. It will be reviewed shortly.` })
      await fetchProfileStats()
    } catch (err) {
      toast({ title: 'Upload Failed', description: err instanceof Error ? err.message : 'Failed to upload document.', variant: 'destructive' })
    } finally {
      setUploadingDocType(null)
    }
  }, [fetchProfileStats, toast])

  const handleFileChange = useCallback((documentType: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleDocumentUpload(documentType, file)
    e.target.value = ''
  }, [handleDocumentUpload])

  // ── Document delete handler ────────────────────────────────────────

  const handleDocumentDelete = useCallback(async (documentType: string) => {
    setUploadingDocType(documentType)
    try {
      const res = await fetch('/api/seller/documents', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentType }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete document')
      toast({ title: 'Document Removed', description: `${DOC_LABELS[documentType]} has been removed.` })
      await fetchProfileStats()
    } catch (err) {
      toast({ title: 'Delete Failed', description: err instanceof Error ? err.message : 'Failed to delete document.', variant: 'destructive' })
    } finally {
      setUploadingDocType(null)
    }
  }, [fetchProfileStats, toast])

  // Loading states
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-6 w-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!authenticated) return null
  if (loadingData || !profile || !stats) return <ProfileSkeleton />

  // Computed values
  const uploadedDocCount = DOC_TYPES.filter((dt) => profile.documents?.[dt as keyof typeof profile.documents]).length
  const verifiedDocCount = DOC_TYPES.filter((dt) => profile.documents?.[dt as keyof typeof profile.documents]?.verified).length
  const fulfillmentRate = stats.totalOrders > 0 ? Math.round((stats.deliveredOrders / stats.totalOrders) * 100) : 0

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">

      {/* ═══════════════════ Dialogs ═══════════════════ */}
      <EditPersonalInfoDialog open={editPersonalOpen} onOpenChange={setEditPersonalOpen} profile={profile} onSave={handleSavePersonal} saving={savingField === 'personal'} />
      <EditBusinessDetailsDialog open={editBusinessOpen} onOpenChange={setEditBusinessOpen} profile={profile} onSave={handleSaveBusiness} saving={savingField === 'business'} />
      <EditBankDetailsDialog open={editBankOpen} onOpenChange={setEditBankOpen} profile={profile} onSave={handleSaveBank} saving={savingField === 'bank'} />
      <EditPickupAddressDialog open={editPickupOpen} onOpenChange={setEditPickupOpen} profile={profile} onSave={handleSavePickup} saving={savingField === 'pickup'} />

      {/* ═══════════════════ Profile Header Card — Modern Compact Redesign ═══════════════════ */}
      <motion.div variants={itemVariants}>
        <Card className="overflow-hidden border-border/60">
          {/* ── Cover Section ── */}
          <div className="group relative h-20 sm:h-24 overflow-hidden">
            {profile.coverImage?.url ? (
              <img src={profile.coverImage.url} alt="Cover" className="absolute inset-0 w-full h-full object-cover" />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-600" />
            )}
            {/* Subtle dark gradient at bottom for depth */}
            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/20 to-transparent" />
            {/* Cover upload button — top-right corner, always visible */}
            <button
              onClick={() => coverImageInputRef.current?.click()}
              disabled={uploadingCoverImage}
              className="absolute top-2 right-2 z-10 h-7 w-7 flex items-center justify-center rounded-lg bg-black/40 backdrop-blur-sm hover:bg-black/60 transition-colors cursor-pointer disabled:cursor-not-allowed"
              aria-label="Upload cover image"
              title="Upload cover image"
            >
              {uploadingCoverImage ? (
                <Loader2 className="h-3.5 w-3.5 text-white animate-spin" />
              ) : (
                <Camera className="h-3.5 w-3.5 text-white" />
              )}
            </button>
            <input ref={coverImageInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleCoverImageUpload} className="hidden" />
          </div>

          {/* ── Profile Info Section ── */}
          <CardContent className="pt-0 px-4 sm:px-6 pb-4 relative">
            {/* Avatar + Info — horizontal layout on desktop, stacked on mobile */}
            <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4 -mt-8 sm:-mt-10">
              {/* Avatar */}
              <div className="relative group flex-shrink-0 mx-auto sm:mx-0">
                <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-2xl border-4 border-card shadow-md overflow-hidden flex items-center justify-center bg-gradient-to-br from-emerald-400 to-teal-500">
                  {profile.profileImage?.url ? (
                    <img src={profile.profileImage.url} alt={profile.storeName || 'Profile'} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xl sm:text-2xl font-bold text-white">{profile.storeName?.charAt(0)?.toUpperCase() || 'S'}</span>
                  )}
                </div>
                {/* Camera button — small, bottom-right of avatar */}
                <button
                  onClick={() => profileImageInputRef.current?.click()}
                  disabled={uploadingProfileImage}
                  className="absolute -bottom-1 -right-1 h-6 w-6 flex items-center justify-center rounded-full bg-foreground text-background shadow-md hover:scale-110 transition-transform cursor-pointer disabled:cursor-not-allowed border-2 border-card z-10"
                  aria-label="Upload profile image"
                  title="Upload profile image"
                >
                  {uploadingProfileImage ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Camera className="h-3 w-3" />
                  )}
                </button>
                <input ref={profileImageInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleProfileImageUpload} className="hidden" />
              </div>

              {/* Store name + badges + info */}
              <div className="flex-1 min-w-0 text-center sm:text-left sm:pt-2">
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5">
                  <h1 className="text-lg sm:text-xl font-bold text-foreground tracking-tight truncate">{profile.storeName || 'My Store'}</h1>
                  {profile.isVerified ? (
                    <Badge className="gap-1 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 px-2 py-0 h-5 text-[10px]">
                      <BadgeCheck className="h-3 w-3" /> Verified
                    </Badge>
                  ) : (
                    <Badge className="gap-1 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 px-2 py-0 h-5 text-[10px]">
                      <ShieldAlert className="h-3 w-3" /> Unverified
                    </Badge>
                  )}
                  {profile.status === 'Active' && <Badge variant="outline" className="text-[10px] px-2 py-0 h-5 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400">Active</Badge>}
                  {profile.status === 'Blocked' && <Badge variant="outline" className="text-[10px] px-2 py-0 h-5 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400">Blocked</Badge>}
                </div>
                {/* Info pills */}
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-2">
                  <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/50 text-[11px] text-muted-foreground">
                    <User className="h-3 w-3" />
                    <span className="truncate max-w-[100px]">{profile.name}</span>
                  </div>
                  <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/50 text-[11px] text-muted-foreground">
                    <Building2 className="h-3 w-3" />
                    <span className="truncate max-w-[120px]">{BUSINESS_TYPE_LABELS[profile.businessType] || profile.businessType || '\u2014'}</span>
                  </div>
                  <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/50 text-[11px] text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    <span>{formatMemberSince(stats.memberDays)}</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ═══════════════════ Performance Stats Grid ═══════════════════ */}
      <motion.div variants={itemVariants}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Card><CardContent className="p-4"><div className="flex items-center gap-3"><div className="h-10 w-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center flex-shrink-0"><Package className="h-5 w-5 text-emerald-600 dark:text-emerald-400" /></div><div className="min-w-0"><p className="text-xs text-muted-foreground font-medium">Products</p><p className="text-lg font-bold text-foreground leading-tight">{stats.totalProducts}</p><p className="text-[10px] text-muted-foreground">{stats.activeProducts} active</p></div></div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center gap-3"><div className="h-10 w-10 rounded-xl bg-teal-50 dark:bg-teal-950/30 flex items-center justify-center flex-shrink-0"><ShoppingCart className="h-5 w-5 text-teal-600 dark:text-teal-400" /></div><div className="min-w-0"><p className="text-xs text-muted-foreground font-medium">Orders</p><p className="text-lg font-bold text-foreground leading-tight">{stats.totalOrders}</p><p className="text-[10px] text-muted-foreground">{stats.deliveredOrders} delivered</p></div></div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center gap-3"><div className="h-10 w-10 rounded-xl bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center flex-shrink-0"><IndianRupee className="h-5 w-5 text-amber-600 dark:text-amber-400" /></div><div className="min-w-0"><p className="text-xs text-muted-foreground font-medium">Revenue</p><p className="text-lg font-bold text-foreground leading-tight truncate">{fmtPrice(stats.totalRevenue, 0)}</p><p className="text-[10px] text-muted-foreground">total earned</p></div></div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center gap-3"><div className="h-10 w-10 rounded-xl bg-orange-50 dark:bg-orange-950/30 flex items-center justify-center flex-shrink-0"><Star className="h-5 w-5 text-orange-500 dark:text-orange-400" /></div><div className="min-w-0"><p className="text-xs text-muted-foreground font-medium">Rating</p><div className="flex items-center gap-1"><p className="text-lg font-bold text-foreground leading-tight">{stats.averageRating}</p><Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" /></div><p className="text-[10px] text-muted-foreground">{stats.totalReviews} reviews</p></div></div></CardContent></Card>
        </div>
      </motion.div>

      {/* ═══════════════════ Tabbed Content ═══════════════════ */}
      <motion.div variants={itemVariants}>
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="bg-muted/50 p-1 h-auto flex-wrap">
            <TabsTrigger value="overview" className="text-xs sm:text-sm gap-1.5 data-[state=active]:bg-card data-[state=active]:shadow-sm"><User className="h-3.5 w-3.5" />Overview</TabsTrigger>
            <TabsTrigger value="business" className="text-xs sm:text-sm gap-1.5 data-[state=active]:bg-card data-[state=active]:shadow-sm"><Building2 className="h-3.5 w-3.5" />Business</TabsTrigger>
            <TabsTrigger value="banking" className="text-xs sm:text-sm gap-1.5 data-[state=active]:bg-card data-[state=active]:shadow-sm"><Landmark className="h-3.5 w-3.5" />Banking</TabsTrigger>
            <TabsTrigger value="documents" className="text-xs sm:text-sm gap-1.5 data-[state=active]:bg-card data-[state=active]:shadow-sm"><FileCheck className="h-3.5 w-3.5" />Documents</TabsTrigger>
          </TabsList>

          {/* ──────────── Overview Tab ──────────── */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Personal Information Card */}
              <Card className="overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-emerald-500 to-teal-400" />
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center"><User className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" /></div>
                      <CardTitle className="text-base font-semibold">Personal Information</CardTitle>
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => setEditPersonalOpen(true)}>
                      <Edit3 className="h-3 w-3" /> Edit
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30"><div className="h-8 w-8 rounded-md bg-background flex items-center justify-center flex-shrink-0"><User className="h-4 w-4 text-muted-foreground" /></div><div className="flex-1 min-w-0"><p className="text-[11px] text-muted-foreground">Full Name</p><p className="text-sm font-medium text-foreground truncate">{profile.name || '\u2014'}</p></div></div>
                    <div className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30"><div className="h-8 w-8 rounded-md bg-background flex items-center justify-center flex-shrink-0"><Mail className="h-4 w-4 text-muted-foreground" /></div><div className="flex-1 min-w-0"><p className="text-[11px] text-muted-foreground">Email Address</p><p className="text-sm font-medium text-foreground truncate">{profile.email}</p></div></div>
                    <div className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30"><div className="h-8 w-8 rounded-md bg-background flex items-center justify-center flex-shrink-0"><Phone className="h-4 w-4 text-muted-foreground" /></div><div className="flex-1 min-w-0"><p className="text-[11px] text-muted-foreground">Phone Number</p><p className="text-sm font-medium text-foreground">{profile.phone || '\u2014'}</p></div></div>
                    <div className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30"><div className="h-8 w-8 rounded-md bg-background flex items-center justify-center flex-shrink-0"><Hash className="h-4 w-4 text-muted-foreground" /></div><div className="flex-1 min-w-0"><p className="text-[11px] text-muted-foreground">Store ID</p><div className="flex items-center gap-1.5"><p className="text-sm font-medium text-foreground font-mono truncate text-xs">{profile._id}</p><CopyButton text={profile._id} label="Store ID" /></div></div></div>
                  </div>
                </CardContent>
              </Card>

              {/* Account Status Card */}
              <Card className="overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-teal-500 to-emerald-400" />
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-lg bg-teal-50 dark:bg-teal-950/30 flex items-center justify-center"><ShieldCheck className="h-4.5 w-4.5 text-teal-600 dark:text-teal-400" /></div>
                    <div><CardTitle className="text-base font-semibold">Account Status</CardTitle><CardDescription className="text-xs mt-0.5">Verification and account health</CardDescription></div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-3">
                    {/* Verification Status */}
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                      <div className={cn('h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0', profile.isVerified && 'bg-emerald-100 dark:bg-emerald-950/30', !profile.isVerified && profile.verificationStatus === 'pending' && 'bg-amber-100 dark:bg-amber-950/30', !profile.isVerified && (profile.verificationStatus === 'rejected' || profile.verificationStatus === 'resubmission_requested') && 'bg-red-100 dark:bg-red-950/30')}>
                        {profile.isVerified ? <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" /> : profile.verificationStatus === 'pending' ? <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400" /> : <ShieldX className="h-5 w-5 text-red-600 dark:text-red-400" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground">Verification Status</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge className={cn('gap-1 px-2.5 py-0.5', profile.isVerified && 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800', !profile.isVerified && profile.verificationStatus === 'pending' && 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800', !profile.isVerified && profile.verificationStatus === 'in_review' && 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800', !profile.isVerified && (profile.verificationStatus === 'rejected' || profile.verificationStatus === 'resubmission_requested') && 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800')}>
                            {profile.isVerified && <><CheckCircle2 className="h-3 w-3" /> Verified</>}
                            {!profile.isVerified && profile.verificationStatus === 'pending' && <><Clock className="h-3 w-3" /> Pending</>}
                            {!profile.isVerified && profile.verificationStatus === 'in_review' && <><Clock className="h-3 w-3" /> In Review</>}
                            {!profile.isVerified && profile.verificationStatus === 'rejected' && <><XCircle className="h-3 w-3" /> Rejected</>}
                            {!profile.isVerified && profile.verificationStatus === 'resubmission_requested' && <><XCircle className="h-3 w-3" /> Resubmit</>}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30"><div className="h-8 w-8 rounded-md bg-background flex items-center justify-center flex-shrink-0"><Store className="h-4 w-4 text-muted-foreground" /></div><div className="flex-1 min-w-0"><p className="text-[11px] text-muted-foreground">Account Status</p><div className="flex items-center gap-2 mt-0.5"><div className={cn('h-2 w-2 rounded-full', profile.status === 'Active' ? 'bg-emerald-500' : profile.status === 'Blocked' ? 'bg-red-500' : 'bg-amber-500')} /><p className="text-sm font-medium text-foreground">{profile.status}</p></div></div></div>
                    <div className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30"><div className="h-8 w-8 rounded-md bg-background flex items-center justify-center flex-shrink-0"><Calendar className="h-4 w-4 text-muted-foreground" /></div><div className="flex-1 min-w-0"><p className="text-[11px] text-muted-foreground">Member Since</p><p className="text-sm font-medium text-foreground">{formatDate(profile.createdAt)}</p></div></div>
                    <div className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30"><div className="h-8 w-8 rounded-md bg-background flex items-center justify-center flex-shrink-0"><Clock className="h-4 w-4 text-muted-foreground" /></div><div className="flex-1 min-w-0"><p className="text-[11px] text-muted-foreground">Last Login</p><p className="text-sm font-medium text-foreground">{formatDateTime(profile.lastLoginAt)}</p></div></div>
                    {/* Fulfillment Rate */}
                    <div className="p-3 rounded-lg bg-muted/30">
                      <div className="flex items-center justify-between mb-2"><p className="text-xs text-muted-foreground font-medium">Fulfillment Rate</p><p className="text-sm font-bold text-foreground">{fulfillmentRate}%</p></div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-700" style={{ width: `${fulfillmentRate}%` }} /></div>
                      <p className="text-[10px] text-muted-foreground mt-1.5">{stats.deliveredOrders} of {stats.totalOrders} orders delivered</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Pickup Address Card */}
            <Card className="overflow-hidden">
              <div className="h-1 bg-gradient-to-r from-emerald-500 to-teal-400" />
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5"><div className="h-8 w-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center"><MapPin className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" /></div><div><CardTitle className="text-base font-semibold">Pickup Address</CardTitle><CardDescription className="text-xs mt-0.5">Where orders will be picked up from</CardDescription></div></div>
                  <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => setEditPickupOpen(true)}>
                    <Edit3 className="h-3 w-3" /> Edit
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {profile.pickupAddress ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30"><div className="h-8 w-8 rounded-md bg-background flex items-center justify-center flex-shrink-0"><User className="h-4 w-4 text-muted-foreground" /></div><div className="flex-1 min-w-0"><p className="text-[11px] text-muted-foreground">Contact Name</p><p className="text-sm font-medium text-foreground truncate">{profile.pickupAddress.fullName || '\u2014'}</p></div></div>
                    <div className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30"><div className="h-8 w-8 rounded-md bg-background flex items-center justify-center flex-shrink-0"><Phone className="h-4 w-4 text-muted-foreground" /></div><div className="flex-1 min-w-0"><p className="text-[11px] text-muted-foreground">Contact Phone</p><p className="text-sm font-medium text-foreground">{profile.pickupAddress.phone || '\u2014'}</p></div></div>
                    <div className="sm:col-span-2 p-3 rounded-lg bg-muted/30"><div className="flex items-start gap-3"><div className="h-8 w-8 rounded-md bg-background flex items-center justify-center flex-shrink-0 mt-0.5"><MapPin className="h-4 w-4 text-muted-foreground" /></div><div className="flex-1 min-w-0"><p className="text-[11px] text-muted-foreground">Full Address</p><p className="text-sm font-medium text-foreground leading-relaxed">{[profile.pickupAddress.addressLine1, profile.pickupAddress.addressLine2, profile.pickupAddress.city, profile.pickupAddress.state, profile.pickupAddress.pincode].filter(Boolean).join(', ')}</p></div></div></div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <MapPin className="h-10 w-10 text-muted-foreground/30 mb-3" />
                    <p className="text-sm text-muted-foreground">No pickup address set</p>
                    <Button variant="outline" size="sm" className="mt-3 gap-1.5 text-xs h-8" onClick={() => setEditPickupOpen(true)}>
                      <Edit3 className="h-3 w-3" /> Add Address
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ──────────── Business Tab ──────────── */}
          <TabsContent value="business" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Business Details Card */}
              <Card className="overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-emerald-500 to-teal-400" />
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5"><div className="h-8 w-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center"><Building2 className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" /></div><div><CardTitle className="text-base font-semibold">Business Details</CardTitle><CardDescription className="text-xs mt-0.5">Your business type and information</CardDescription></div></div>
                    <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => setEditBusinessOpen(true)}>
                      <Edit3 className="h-3 w-3" /> Edit
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30"><div className="h-10 w-10 rounded-lg bg-emerald-100 dark:bg-emerald-950/30 flex items-center justify-center flex-shrink-0"><Building2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" /></div><div className="flex-1 min-w-0"><p className="text-xs text-muted-foreground">Business Type</p><p className="text-sm font-semibold text-foreground">{BUSINESS_TYPE_LABELS[profile.businessType] || profile.businessType || '\u2014'}</p></div></div>
                    <div className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30"><div className="h-8 w-8 rounded-md bg-background flex items-center justify-center flex-shrink-0"><FileText className="h-4 w-4 text-muted-foreground" /></div><div className="flex-1 min-w-0"><div className="flex items-center gap-1.5"><p className="text-[11px] text-muted-foreground">GST Number</p>{profile.gstNumber && profile.documents?.gst_certificate?.verified && <CheckCircle2 className="h-3 w-3 text-emerald-500" />}</div><div className="flex items-center gap-1.5"><p className="text-sm font-medium text-foreground font-mono">{profile.gstNumber || '\u2014'}</p>{profile.gstNumber && <CopyButton text={profile.gstNumber} label="GST Number" />}</div></div></div>
                    <div className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30"><div className="h-8 w-8 rounded-md bg-background flex items-center justify-center flex-shrink-0"><CreditCard className="h-4 w-4 text-muted-foreground" /></div><div className="flex-1 min-w-0"><div className="flex items-center gap-1.5"><p className="text-[11px] text-muted-foreground">PAN Number</p>{profile.panNumber && profile.documents?.pan_card?.verified && <CheckCircle2 className="h-3 w-3 text-emerald-500" />}</div><div className="flex items-center gap-1.5"><p className="text-sm font-medium text-foreground font-mono">{profile.panNumber || '\u2014'}</p>{profile.panNumber && <CopyButton text={profile.panNumber} label="PAN Number" />}</div></div></div>
                    <div className="flex items-start gap-2.5 p-3 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30"><Info className="h-4 w-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" /><p className="text-xs text-emerald-700 dark:text-emerald-300 leading-relaxed">Business details are used for tax compliance and verification. GST is mandatory for non-individual sellers.</p></div>
                  </div>
                </CardContent>
              </Card>

              {/* Store Performance Card */}
              <Card className="overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-teal-500 to-emerald-400" />
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2.5"><div className="h-8 w-8 rounded-lg bg-teal-50 dark:bg-teal-950/30 flex items-center justify-center"><TrendingUp className="h-4.5 w-4.5 text-teal-600 dark:text-teal-400" /></div><div><CardTitle className="text-base font-semibold">Store Performance</CardTitle><CardDescription className="text-xs mt-0.5">Key metrics and performance indicators</CardDescription></div></div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-4">
                    <div><div className="flex items-center justify-between mb-1.5"><p className="text-xs text-muted-foreground font-medium">Product Catalog</p><p className="text-sm font-bold text-foreground">{stats.totalProducts} total</p></div><div className="h-2 bg-muted rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-700" style={{ width: stats.totalProducts > 0 ? `${(stats.activeProducts / stats.totalProducts) * 100}%` : '0%' }} /></div><p className="text-[10px] text-muted-foreground mt-1">{stats.activeProducts} active, {stats.totalProducts - stats.activeProducts} inactive/draft</p></div>
                    <div><div className="flex items-center justify-between mb-1.5"><p className="text-xs text-muted-foreground font-medium">Fulfillment Rate</p><p className="text-sm font-bold text-foreground">{fulfillmentRate}%</p></div><div className="h-2 bg-muted rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-700" style={{ width: `${fulfillmentRate}%` }} /></div><p className="text-[10px] text-muted-foreground mt-1">{stats.deliveredOrders} delivered out of {stats.totalOrders} orders</p></div>
                    <div><div className="flex items-center justify-between mb-1.5"><p className="text-xs text-muted-foreground font-medium">Customer Rating</p><div className="flex items-center gap-1"><p className="text-sm font-bold text-foreground">{stats.averageRating}</p><Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" /></div></div><div className="h-2 bg-muted rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-amber-400 to-orange-400 rounded-full transition-all duration-700" style={{ width: `${(stats.averageRating / 5) * 100}%` }} /></div><p className="text-[10px] text-muted-foreground mt-1">Based on {stats.totalReviews} customer reviews</p></div>
                    <div className="p-3 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30"><div className="flex items-center gap-2.5"><IndianRupee className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /><div><p className="text-xs text-muted-foreground">Total Revenue Earned</p><p className="text-lg font-bold text-foreground">{fmtPrice(stats.totalRevenue)}</p></div></div></div>
                    <div className="grid grid-cols-2 gap-2">
                      <Link href="/seller/products"><Button variant="outline" size="sm" className="w-full h-8 text-xs gap-1.5"><Package className="h-3.5 w-3.5" />Manage Products</Button></Link>
                      <Link href="/seller/analytics"><Button variant="outline" size="sm" className="w-full h-8 text-xs gap-1.5"><TrendingUp className="h-3.5 w-3.5" />View Analytics</Button></Link>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ──────────── Banking Tab ──────────── */}
          <TabsContent value="banking" className="space-y-6">
            <Card className="overflow-hidden">
              <div className="h-1 bg-gradient-to-r from-emerald-500 to-teal-400" />
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5"><div className="h-8 w-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center"><Landmark className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" /></div><div><CardTitle className="text-base font-semibold">Bank Account Details</CardTitle><CardDescription className="text-xs mt-0.5">Where your earnings will be deposited</CardDescription></div></div>
                  <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => setEditBankOpen(true)}>
                    <Edit3 className="h-3 w-3" /> Edit
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {profile.bankDetails ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30"><div className="h-10 w-10 rounded-lg bg-emerald-100 dark:bg-emerald-950/30 flex items-center justify-center flex-shrink-0"><User className="h-5 w-5 text-emerald-600 dark:text-emerald-400" /></div><div className="flex-1 min-w-0"><p className="text-xs text-muted-foreground">Account Holder Name</p><p className="text-sm font-semibold text-foreground">{profile.bankDetails.accountName || '\u2014'}</p></div></div>
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30"><div className="h-10 w-10 rounded-lg bg-teal-100 dark:bg-teal-950/30 flex items-center justify-center flex-shrink-0"><Hash className="h-5 w-5 text-teal-600 dark:text-teal-400" /></div><div className="flex-1 min-w-0"><p className="text-xs text-muted-foreground">Account Number</p><div className="flex items-center gap-2"><p className="text-sm font-semibold text-foreground font-mono tracking-wider">{maskAccountNumber(profile.bankDetails.accountNumber)}</p>{profile.bankDetails.verified && <Badge className="gap-1 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 px-2 py-0 h-5 text-[10px]"><CheckCircle2 className="h-2.5 w-2.5" />Verified</Badge>}</div></div></div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30"><div className="h-8 w-8 rounded-md bg-background flex items-center justify-center flex-shrink-0"><Globe className="h-4 w-4 text-muted-foreground" /></div><div className="flex-1 min-w-0"><p className="text-[11px] text-muted-foreground">IFSC Code</p><div className="flex items-center gap-1.5"><p className="text-sm font-medium text-foreground font-mono">{profile.bankDetails.ifsc || '\u2014'}</p>{profile.bankDetails.ifsc && <CopyButton text={profile.bankDetails.ifsc} label="IFSC Code" />}</div></div></div>
                      <div className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30"><div className="h-8 w-8 rounded-md bg-background flex items-center justify-center flex-shrink-0"><Landmark className="h-4 w-4 text-muted-foreground" /></div><div className="flex-1 min-w-0"><p className="text-[11px] text-muted-foreground">Bank Name</p><p className="text-sm font-medium text-foreground truncate">{profile.bankDetails.bankName || '\u2014'}</p></div></div>
                    </div>
                    {profile.documents?.cancel_cheque && (
                      <div className={cn('flex items-center gap-3 p-3 rounded-lg', profile.documents.cancel_cheque.verified ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30' : 'bg-amber-50/50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30')}>
                        {profile.documents.cancel_cheque.verified ? <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" /> : <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />}
                        <div><p className="text-sm font-medium text-foreground">Cancel Cheque / Bank Statement</p><p className="text-xs text-muted-foreground">{profile.documents.cancel_cheque.verified ? 'Verified' : 'Pending verification'} &middot; Uploaded {formatDate(profile.documents.cancel_cheque.uploadedAt)}</p></div>
                      </div>
                    )}
                    <div className="flex items-start gap-2.5 p-3 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30"><Info className="h-4 w-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" /><p className="text-xs text-emerald-700 dark:text-emerald-300 leading-relaxed">Bank account details are used for depositing your earnings. Account number is partially masked for security.</p></div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Landmark className="h-12 w-12 text-muted-foreground/30 mb-3" />
                    <p className="text-sm font-medium text-muted-foreground">No bank details added</p>
                    <p className="text-xs text-muted-foreground mt-1">Add your bank account to receive earnings</p>
                    <Button size="sm" className="mt-4 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white h-8" onClick={() => setEditBankOpen(true)}>
                      <Edit3 className="h-3.5 w-3.5" /> Add Bank Details
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Earnings Summary Card */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5"><div className="h-8 w-8 rounded-lg bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center"><IndianRupee className="h-4.5 w-4.5 text-amber-600 dark:text-amber-400" /></div><div><CardTitle className="text-base font-semibold">Earnings Overview</CardTitle><CardDescription className="text-xs mt-0.5">Quick summary of your earnings</CardDescription></div></div>
                  <Link href="/seller/earnings"><Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground">View Details <ArrowUpRight className="h-3 w-3" /></Button></Link>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30"><p className="text-xs text-muted-foreground">Total Revenue</p><p className="text-lg font-bold text-foreground">{fmtPrice(stats.totalRevenue)}</p></div>
                  <div className="p-3 rounded-lg bg-amber-50/50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30"><p className="text-xs text-muted-foreground">Orders Fulfilled</p><p className="text-lg font-bold text-foreground">{stats.deliveredOrders}</p></div>
                  <div className="p-3 rounded-lg bg-teal-50/50 dark:bg-teal-950/20 border border-teal-100 dark:border-teal-900/30"><p className="text-xs text-muted-foreground">Avg. per Order</p><p className="text-lg font-bold text-foreground">{stats.deliveredOrders > 0 ? fmtPrice(stats.totalRevenue / stats.deliveredOrders) : fmtPrice(0)}</p></div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ──────────── Documents Tab ──────────── */}
          <TabsContent value="documents" className="space-y-6">
            <Card className="overflow-hidden">
              <div className="h-1 bg-gradient-to-r from-emerald-500 to-teal-400" />
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2.5"><div className="h-8 w-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center"><FileCheck className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" /></div><div><CardTitle className="text-base font-semibold">Document Verification</CardTitle><CardDescription className="text-xs mt-0.5">Upload and track verification status</CardDescription></div></div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-4">
                  {/* Completion Progress */}
                  <div>
                    <div className="flex items-center justify-between mb-2"><p className="text-sm font-medium text-foreground">Documents Completion</p><p className="text-sm font-bold text-foreground">{stats.documentsCompletion}%</p></div>
                    <div className="h-2.5 bg-muted rounded-full overflow-hidden"><div className={cn('h-full rounded-full transition-all duration-700', stats.documentsCompletion === 100 ? 'bg-gradient-to-r from-emerald-500 to-teal-400' : stats.documentsCompletion >= 60 ? 'bg-gradient-to-r from-amber-400 to-amber-500' : 'bg-gradient-to-r from-red-400 to-red-500')} style={{ width: `${stats.documentsCompletion}%` }} /></div>
                    <div className="flex items-center justify-between mt-1.5"><p className="text-[11px] text-muted-foreground">{uploadedDocCount} of {DOC_TYPES.length} documents uploaded</p><p className="text-[11px] text-muted-foreground">{verifiedDocCount} verified</p></div>
                  </div>

                  <Separator />

                  {/* Verification Status Banner */}
                  {profile.verificationStatus === 'verified' && <div className="flex items-start gap-2.5 p-3 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30"><CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" /><p className="text-xs text-emerald-700 dark:text-emerald-300 leading-relaxed">All documents have been verified. Your seller account is fully verified.</p></div>}
                  {profile.verificationStatus === 'pending' && <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-50/50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30"><Clock className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" /><p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">Your documents are awaiting review. This usually takes 1-2 business days.</p></div>}
                  {profile.verificationStatus === 'in_review' && <div className="flex items-start gap-2.5 p-3 rounded-lg bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30"><Clock className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" /><p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">Your documents are currently being reviewed.</p></div>}
                  {(profile.verificationStatus === 'rejected' || profile.verificationStatus === 'resubmission_requested') && <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-50/50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30"><XCircle className="h-4 w-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" /><p className="text-xs text-red-700 dark:text-red-300 leading-relaxed">Some documents require resubmission. Review the rejection reasons and re-upload.</p></div>}

                  {/* Document Cards with Upload/Delete */}
                  <div className="space-y-3">
                    {DOC_TYPES.map((docType) => {
                      const doc = profile.documents?.[docType as keyof typeof profile.documents]
                      const isMissing = !doc
                      const isRejected = doc && !doc.verified && doc.rejectionReason
                      const isPending = doc && !doc.verified && !doc.rejectionReason
                      const isVerified = doc && doc.verified
                      const isUploading = uploadingDocType === docType

                      return (
                        <div key={docType} className={cn('rounded-xl border p-4 transition-colors', isVerified && 'border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/30 dark:bg-emerald-950/10', isPending && 'border-amber-200 dark:border-amber-900/40 bg-amber-50/30 dark:bg-amber-950/10', isRejected && 'border-red-200 dark:border-red-900/40 bg-red-50/30 dark:bg-red-950/10', isMissing && 'border-dashed border-border bg-muted/20')}>
                          <div className="flex items-center gap-3">
                            <div className={cn('h-12 w-12 rounded-xl flex items-center justify-center flex-shrink-0', isVerified && 'bg-emerald-100 dark:bg-emerald-950/30', isPending && 'bg-amber-100 dark:bg-amber-950/30', isRejected && 'bg-red-100 dark:bg-red-950/30', isMissing && 'bg-muted/50')}>
                              {isVerified ? <FileCheck className="h-6 w-6 text-emerald-600 dark:text-emerald-400" /> : isPending ? <FileUp className="h-6 w-6 text-amber-600 dark:text-amber-400" /> : isRejected ? <XCircle className="h-6 w-6 text-red-600 dark:text-red-400" /> : <FileText className="h-6 w-6 text-muted-foreground" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-foreground">{DOC_LABELS[docType]}</p>
                              <div className="flex items-center gap-2 mt-1">
                                {isMissing && <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 text-muted-foreground border-dashed">Not Uploaded</Badge>}
                                {doc && (
                                  <>
                                    <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 h-5', isVerified && 'border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400', isPending && 'border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400', isRejected && 'border-red-200 dark:border-red-800 text-red-700 dark:text-red-400')}>
                                      {isVerified ? '\u2713 Verified' : isPending ? '\u23F3 Pending' : '\u2717 Rejected'}
                                    </Badge>
                                    <span className="text-[11px] text-muted-foreground">Uploaded {formatDate(doc.uploadedAt)}</span>
                                  </>
                                )}
                              </div>
                              {isRejected && doc.rejectionReason && <p className="text-xs text-red-600 dark:text-red-400 mt-1.5 line-clamp-2">Reason: {doc.rejectionReason}</p>}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {doc && (
                                <>
                                  <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => window.open(doc.url, '_blank')}><Eye className="h-3.5 w-3.5" />View</Button>
                                  {!isVerified && (
                                    <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20" disabled={isUploading} onClick={() => handleDocumentDelete(docType)}>
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                </>
                              )}
                              {(isMissing || isRejected) && (
                                <Button size="sm" className={cn('h-8 gap-1.5 text-xs', isRejected ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'border border-border')} variant={isMissing ? 'outline' : 'default'} disabled={isUploading} onClick={() => fileInputRefs.current[docType]?.click()}>
                                  {isUploading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Uploading...</> : <><Upload className="h-3.5 w-3.5" />{isMissing ? 'Upload' : 'Re-upload'}</>}
                                </Button>
                              )}
                              <input ref={(el) => { fileInputRefs.current[docType] = el }} type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" className="hidden" onChange={(e) => handleFileChange(docType, e)} />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Verification Notes */}
                  {profile.verificationNotes && profile.verificationNotes.length > 0 && (
                    <><Separator /><div><h4 className="text-sm font-medium text-foreground mb-3">Verification Notes</h4><div className="space-y-2 max-h-48 overflow-y-auto">{profile.verificationNotes.map((note, idx) => (
                      <div key={idx} className="flex items-start gap-2.5 p-2.5 rounded-md bg-muted/30 border border-border"><div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center flex-shrink-0"><Info className="h-3 w-3 text-muted-foreground" /></div><div className="flex-1 min-w-0"><p className="text-xs text-foreground">{note.note}</p><p className="text-[10px] text-muted-foreground mt-1">By {note.addedBy} &middot; {formatDateTime(note.addedAt)}</p></div></div>
                    ))}</div></div></>
                  )}

                  <div className="flex items-start gap-2.5 p-3 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30"><Info className="h-4 w-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" /><p className="text-xs text-emerald-700 dark:text-emerald-300 leading-relaxed">Accepted formats: JPG, PNG, WebP, PDF. Maximum file size: 5MB per document. Documents are typically reviewed within 1-2 business days.</p></div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </motion.div>

      {/* ═══════════════════ Quick Actions ═══════════════════ */}
      <motion.div variants={itemVariants}>
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2.5"><div className="h-8 w-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center"><ArrowUpRight className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" /></div><CardTitle className="text-base font-semibold">Quick Actions</CardTitle></div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Link href="/seller/products"><div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer group"><div className="h-10 w-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center group-hover:scale-110 transition-transform"><Package className="h-5 w-5 text-emerald-600 dark:text-emerald-400" /></div><p className="text-xs font-medium text-foreground text-center">Manage Products</p></div></Link>
              <Link href="/seller/orders"><div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer group"><div className="h-10 w-10 rounded-lg bg-teal-50 dark:bg-teal-950/30 flex items-center justify-center group-hover:scale-110 transition-transform"><ShoppingCart className="h-5 w-5 text-teal-600 dark:text-teal-400" /></div><p className="text-xs font-medium text-foreground text-center">View Orders</p></div></Link>
              <Link href="/seller/earnings"><div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer group"><div className="h-10 w-10 rounded-lg bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center group-hover:scale-110 transition-transform"><IndianRupee className="h-5 w-5 text-amber-600 dark:text-amber-400" /></div><p className="text-xs font-medium text-foreground text-center">Earnings</p></div></Link>
              <Link href="/seller/settings"><div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer group"><div className="h-10 w-10 rounded-lg bg-orange-50 dark:bg-orange-950/30 flex items-center justify-center group-hover:scale-110 transition-transform"><Settings className="h-5 w-5 text-orange-600 dark:text-orange-400" /></div><p className="text-xs font-medium text-foreground text-center">Settings</p></div></Link>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}
