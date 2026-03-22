'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../utils/supabase';
import { useApp } from '../../context/AppContext';

interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  birth?: string;
  address?: string;
  license_no?: string;
  license_type?: string;
  license_date?: string;
  license_expiry?: string;
  [key: string]: any;
}

interface Car {
  id: string;
  number: string;
  brand?: string;
  model?: string;
  fuel_type?: string;
  [key: string]: any;
}

interface InsurancePolicy {
  id: string;
  ins_own_limit: number;
  ins_own_deductible: number;
  ins_person_limit: number;
  ins_person_deductible: number;
  ins_property_limit: number;
  ins_property_deductible: number;
  ins_injury_limit: number;
  ins_injury_deductible: number;
  ins_death_limit: number;
}

export default function CreateContractPage() {
  const router = useRouter();
  const { company, role, adminSelectedCompanyId } = useApp();
  const companyId = role === 'admin' ? adminSelectedCompanyId : company?.id;
  // supabase is imported from utils

  // State management
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [cars, setCars] = useState<Car[]>([]);
  const [insurancePolicies, setInsurancePolicies] = useState<InsurancePolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state - Section 1: Renter info
  const [renterCustomerId, setRenterCustomerId] = useState('');
  const [renterManualMode, setRenterManualMode] = useState(false);
  const [renterName, setRenterName] = useState('');
  const [renterPhone, setRenterPhone] = useState('');
  const [renterEmail, setRenterEmail] = useState('');
  const [renterBirth, setRenterBirth] = useState('');
  const [renterAddress, setRenterAddress] = useState('');
  const [renterLicenseNo, setRenterLicenseNo] = useState('');
  const [renterLicenseType, setRenterLicenseType] = useState('1종보통');
  const [renterLicenseDate, setRenterLicenseDate] = useState('');
  const [renterLicenseExpiry, setRenterLicenseExpiry] = useState('');
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [customerSearchText, setCustomerSearchText] = useState('');

  // Form state - Section 2: Second driver
  const [hasDriver2, setHasDriver2] = useState(false);
  const [driver2CustomerId, setDriver2CustomerId] = useState('');
  const [driver2ManualMode, setDriver2ManualMode] = useState(false);
  const [driver2Name, setDriver2Name] = useState('');
  const [driver2Phone, setDriver2Phone] = useState('');
  const [driver2Email, setDriver2Email] = useState('');
  const [driver2Birth, setDriver2Birth] = useState('');
  const [driver2Address, setDriver2Address] = useState('');
  const [driver2LicenseNo, setDriver2LicenseNo] = useState('');
  const [driver2LicenseType, setDriver2LicenseType] = useState('1종보통');
  const [driver2LicenseDate, setDriver2LicenseDate] = useState('');
  const [driver2LicenseExpiry, setDriver2LicenseExpiry] = useState('');
  const [driver2SearchOpen, setDriver2SearchOpen] = useState(false);
  const [driver2SearchText, setDriver2SearchText] = useState('');

  // Form state - Section 3: Car info
  const [selectedCarId, setSelectedCarId] = useState('');
  const [carManualMode, setCarManualMode] = useState(false);
  const [carModel, setCarModel] = useState('');
  const [carNumber, setCarNumber] = useState('');
  const [carFuelType, setCarFuelType] = useState('');
  const [dispatchAt, setDispatchAt] = useState('');
  const [returnAt, setReturnAt] = useState('');
  const [dispatchFuel, setDispatchFuel] = useState('');
  const [dispatchKm, setDispatchKm] = useState('');
  const [carSearchOpen, setCarSearchOpen] = useState(false);
  const [carSearchText, setCarSearchText] = useState('');

  // Form state - Section 4: Pricing
  const [rentalHours, setRentalHours] = useState('');
  const [totalAmount, setTotalAmount] = useState('');

  // Form state - Section 5: Insurance
  const [insMinAge, setInsMinAge] = useState('26');
  const [insOwnLimit, setInsOwnLimit] = useState('');
  const [insOwnDeductible, setInsOwnDeductible] = useState('');
  const [insPersonLimit, setInsPersonLimit] = useState('');
  const [insPersonDeductible, setInsPersonDeductible] = useState('');
  const [insPropertyLimit, setInsPropertyLimit] = useState('');
  const [insPropertyDeductible, setInsPropertyDeductible] = useState('');
  const [insInjuryLimit, setInsInjuryLimit] = useState('');
  const [insInjuryDeductible, setInsInjuryDeductible] = useState('');
  const [insDeathLimit, setInsDeathLimit] = useState('');
  const [insNote, setInsNote] = useState('');

  // Form state - Section 6: Company info
  const [companyName, setCompanyName] = useState('');
  const [companyCeo, setCompanyCeo] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [companyPhone, setCompanyPhone] = useState('');
  const [staffName, setStaffName] = useState('');
  const [staffPhone, setStaffPhone] = useState('');

  // Form state - Section 7: Special terms
  const [specialTerms, setSpecialTerms] = useState('');

  // Fetch initial data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [customersRes, carsRes] = await Promise.all([
          supabase
            .from('customers')
            .select('*')
            .eq('company_id', companyId),
          supabase
            .from('cars')
            .select('*')
            .eq('company_id', companyId),
        ]);

        if (customersRes.error) {
          console.error('customers error:', JSON.stringify(customersRes.error));
          throw customersRes.error;
        }
        if (carsRes.error) {
          console.error('cars error:', JSON.stringify(carsRes.error));
          throw carsRes.error;
        }

        setCustomers(customersRes.data || []);
        setCars(carsRes.data || []);

        // Initialize company info from context
        if (company) {
          setCompanyName(company.name || '');
          setCompanyCeo(company.ceo || '');
          setCompanyAddress(company.address || '');
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    if (companyId) {
      fetchData();
    }
  }, [companyId, company]);

  // Handle renter selection from dropdown
  const handleRenterSelect = (customer: Customer) => {
    setRenterCustomerId(customer.id);
    setRenterName(customer.name || '');
    setRenterPhone(customer.phone || '');
    setRenterEmail(customer.email || '');
    setRenterBirth(customer.birth || '');
    setRenterAddress(customer.address || '');
    setRenterLicenseNo(customer.license_no || '');
    setRenterLicenseType(customer.license_type || '1종보통');
    setRenterLicenseDate(customer.license_date || '');
    setRenterLicenseExpiry(customer.license_expiry || '');
    setCustomerSearchOpen(false);
    setCustomerSearchText('');
  };

  // Handle driver 2 selection from dropdown
  const handleDriver2Select = (customer: Customer) => {
    setDriver2CustomerId(customer.id);
    setDriver2Name(customer.name || '');
    setDriver2Phone(customer.phone || '');
    setDriver2Email(customer.email || '');
    setDriver2Birth(customer.birth || '');
    setDriver2Address(customer.address || '');
    setDriver2LicenseNo(customer.license_no || '');
    setDriver2LicenseType(customer.license_type || '1종보통');
    setDriver2LicenseDate(customer.license_date || '');
    setDriver2LicenseExpiry(customer.license_expiry || '');
    setDriver2SearchOpen(false);
    setDriver2SearchText('');
  };

  // Handle car selection
  const handleCarSelect = async (car: Car) => {
    setSelectedCarId(car.id);
    setCarModel(`${car.brand} ${car.model}`);
    setCarNumber(car.number);
    setCarFuelType(car.fuel_type);
    setCarSearchOpen(false);
    setCarSearchText('');

    // Fetch insurance policy for this car
    try {
      const { data } = await supabase
        .from('insurance_policy_record')
        .select('*')
        .eq('car_id', car.id)
        .single();

      if (data) {
        setInsOwnLimit(data.ins_own_limit?.toString() || '');
        setInsOwnDeductible(data.ins_own_deductible?.toString() || '');
        setInsPersonLimit(data.ins_person_limit?.toString() || '');
        setInsPersonDeductible(data.ins_person_deductible?.toString() || '');
        setInsPropertyLimit(data.ins_property_limit?.toString() || '');
        setInsPropertyDeductible(data.ins_property_deductible?.toString() || '');
        setInsInjuryLimit(data.ins_injury_limit?.toString() || '');
        setInsInjuryDeductible(data.ins_injury_deductible?.toString() || '');
        setInsDeathLimit(data.ins_death_limit?.toString() || '');
      }
    } catch (error) {
      console.error('Error fetching insurance policy:', error);
    }
  };

  // Auto-calculate rental hours
  useEffect(() => {
    if (dispatchAt && returnAt) {
      const dispatch = new Date(dispatchAt);
      const returnDate = new Date(returnAt);
      const diffMs = returnDate.getTime() - dispatch.getTime();
      const diffHours = Math.round(diffMs / (1000 * 60 * 60));
      setRentalHours(diffHours > 0 ? diffHours.toString() : '');
    }
  }, [dispatchAt, returnAt]);

  // Format number with commas
  const formatNumber = (num: string) => {
    return num.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };

  // Generate contract number
  const generateContractNumber = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const random = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
    return `ST-${year}${month}${day}-${random}`;
  };

  // Save contract
  const handleSave = async (asDraft: boolean = true) => {
    setSaving(true);
    try {
      const contractNumber = generateContractNumber();

      const { data, error } = await supabase
        .from('short_term_rental_contracts')
        .insert({
          company_id: companyId,
          contract_number: contractNumber,
          status: asDraft ? 'draft' : 'pending_send',

          // Renter info
          renter_name: renterName,
          renter_phone: renterPhone,
          renter_email: renterEmail,
          renter_birth: renterBirth,
          renter_address: renterAddress,
          renter_license_no: renterLicenseNo,
          renter_license_type: renterLicenseType,
          renter_license_date: renterLicenseDate,
          renter_license_expiry: renterLicenseExpiry,

          // Driver 2 info
          driver2_name: driver2Name,
          driver2_phone: driver2Phone,
          driver2_email: driver2Email,
          driver2_birth: driver2Birth,
          driver2_address: driver2Address,
          driver2_license_no: driver2LicenseNo,
          driver2_license_type: driver2LicenseType,
          driver2_license_date: driver2LicenseDate,
          driver2_license_expiry: driver2LicenseExpiry,

          // Car info
          car_model: carModel,
          car_number: carNumber,
          car_fuel_type: carFuelType,
          dispatch_at: dispatchAt,
          return_at: returnAt,
          dispatch_fuel: dispatchFuel,
          dispatch_km: dispatchKm ? parseInt(dispatchKm) : null,

          // Pricing
          rental_hours: rentalHours ? parseInt(rentalHours) : null,
          total_amount: totalAmount ? parseInt(totalAmount.replace(/,/g, '')) : null,

          // Insurance
          ins_min_age: insMinAge ? parseInt(insMinAge) : 26,
          ins_own_limit: insOwnLimit ? parseInt(insOwnLimit) : null,
          ins_own_deductible: insOwnDeductible ? parseInt(insOwnDeductible) : null,
          ins_person_limit: insPersonLimit ? parseInt(insPersonLimit) : null,
          ins_person_deductible: insPersonDeductible ? parseInt(insPersonDeductible) : null,
          ins_property_limit: insPropertyLimit ? parseInt(insPropertyLimit) : null,
          ins_property_deductible: insPropertyDeductible ? parseInt(insPropertyDeductible) : null,
          ins_injury_limit: insInjuryLimit ? parseInt(insInjuryLimit) : null,
          ins_injury_deductible: insInjuryDeductible ? parseInt(insInjuryDeductible) : null,
          ins_death_limit: insDeathLimit ? parseInt(insDeathLimit) : null,
          ins_note: insNote,

          // Company info
          company_name: companyName,
          company_ceo: companyCeo,
          company_address: companyAddress,
          company_phone: companyPhone,
          staff_name: staffName,
          staff_phone: staffPhone,

          // Special terms
          special_terms: specialTerms,
        })
        .select('id')
        .single();

      if (error) throw error;

      router.push(`/e-contract/${data.id}`);
    } catch (error) {
      console.error('Error saving contract:', error);
      alert('계약서 저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  // Filter customers for search
  const filteredCustomers = customers.filter((c) =>
    c.name.toLowerCase().includes(customerSearchText.toLowerCase()) ||
    c.phone.includes(customerSearchText)
  );

  const filteredDriver2Customers = customers.filter((c) =>
    c.name.toLowerCase().includes(driver2SearchText.toLowerCase()) ||
    c.phone.includes(driver2SearchText)
  );

  // Filter cars for search
  const filteredCars = cars.filter((c) =>
    `${c.brand} ${c.model} ${c.number}`.toLowerCase().includes(carSearchText.toLowerCase())
  );

  // 회사 미선택 (admin)
  if (role === 'admin' && !companyId) {
    return (
      <div className="max-w-7xl mx-auto py-6 px-4 md:py-10 md:px-6 min-h-screen bg-gray-50">
        <div className="p-12 md:p-20 text-center text-gray-400 text-sm bg-white rounded-2xl">
          <span className="text-4xl block mb-3">🏢</span>
          <p className="font-bold text-gray-600">좌측 상단에서 회사를 먼저 선택해주세요</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px', minHeight: '100vh', background: '#f9fafb' }}>
        <div style={{ padding: '80px 20px', textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
          <p>로드 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.outerWrap}>
    <div style={styles.container}>

      {/* Section 1: Renter Info */}
      <div style={styles.card}>
        <div style={styles.sectionTitle}>임차인 정보</div>

        <div style={styles.fieldGroup}>
          <label style={styles.label}>임차인 선택</label>
          <div style={styles.relative}>
            <input
              type="text"
              placeholder={renterManualMode ? '수기입력 모드' : '고객명 또는 전화번호로 검색'}
              value={renterManualMode ? '' : customerSearchText}
              onChange={(e) => setCustomerSearchText(e.target.value)}
              onFocus={() => !renterManualMode && setCustomerSearchOpen(true)}
              disabled={renterManualMode}
              style={{
                ...styles.input,
                opacity: renterManualMode ? 0.5 : 1,
              }}
            />
            <button
              onClick={() => {
                setRenterManualMode(!renterManualMode);
                setCustomerSearchOpen(false);
                setCustomerSearchText('');
              }}
              style={{
                ...styles.toggleButton,
                right: 8,
                top: 8,
              }}
            >
              {renterManualMode ? '선택' : '수기'}
            </button>
            {customerSearchOpen && !renterManualMode && filteredCustomers.length > 0 && (
              <div style={styles.dropdown}>
                {filteredCustomers.slice(0, 5).map((customer) => (
                  <div
                    key={customer.id}
                    onClick={() => handleRenterSelect(customer)}
                    style={styles.dropdownItem}
                  >
                    {customer.name} ({customer.phone})
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={styles.grid2}>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>이름</label>
            <input
              type="text"
              value={renterName}
              onChange={(e) => setRenterName(e.target.value)}
              style={styles.input}
            />
          </div>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>전화번호</label>
            <input
              type="text"
              value={renterPhone}
              onChange={(e) => setRenterPhone(e.target.value)}
              style={styles.input}
            />
          </div>
        </div>

        <div style={styles.grid2}>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>이메일</label>
            <input
              type="email"
              value={renterEmail}
              onChange={(e) => setRenterEmail(e.target.value)}
              style={styles.input}
            />
          </div>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>생년월일</label>
            <input
              type="date"
              value={renterBirth}
              onChange={(e) => setRenterBirth(e.target.value)}
              style={styles.input}
            />
          </div>
        </div>

        <div style={styles.fieldGroup}>
          <label style={styles.label}>주소</label>
          <input
            type="text"
            value={renterAddress}
            onChange={(e) => setRenterAddress(e.target.value)}
            style={styles.input}
          />
        </div>

        <div style={styles.grid2}>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>면허번호</label>
            <input
              type="text"
              value={renterLicenseNo}
              onChange={(e) => setRenterLicenseNo(e.target.value)}
              style={styles.input}
            />
          </div>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>면허종류</label>
            <select
              value={renterLicenseType}
              onChange={(e) => setRenterLicenseType(e.target.value)}
              style={styles.input}
            >
              <option>1종보통</option>
              <option>1종대형</option>
              <option>2종보통</option>
              <option>2종소형</option>
              <option>원동기</option>
            </select>
          </div>
        </div>

        <div style={styles.grid2}>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>면허 발급일</label>
            <input
              type="date"
              value={renterLicenseDate}
              onChange={(e) => setRenterLicenseDate(e.target.value)}
              style={styles.input}
            />
          </div>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>면허 만료일</label>
            <input
              type="date"
              value={renterLicenseExpiry}
              onChange={(e) => setRenterLicenseExpiry(e.target.value)}
              style={styles.input}
            />
          </div>
        </div>
      </div>

      {/* Section 2: Second Driver */}
      <div style={styles.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: hasDriver2 ? 16 : 0 }}>
          <div style={{ ...styles.sectionTitle, marginBottom: 0 }}>제2운전자 정보</div>
          <button
            onClick={() => setHasDriver2(!hasDriver2)}
            style={{
              padding: '6px 16px',
              background: hasDriver2 ? '#ef4444' : '#2d5fa8',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: '700',
              cursor: 'pointer',
            }}
          >
            {hasDriver2 ? '제거' : '+ 추가'}
          </button>
        </div>

        {hasDriver2 && (
          <>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>제2운전자 선택</label>
              <div style={styles.relative}>
                <input
                  type="text"
                  placeholder={driver2ManualMode ? '수기입력 모드' : '고객명 또는 전화번호로 검색'}
                  value={driver2ManualMode ? '' : driver2SearchText}
                  onChange={(e) => setDriver2SearchText(e.target.value)}
                  onFocus={() => !driver2ManualMode && setDriver2SearchOpen(true)}
                  disabled={driver2ManualMode}
                  style={{
                    ...styles.input,
                    opacity: driver2ManualMode ? 0.5 : 1,
                  }}
                />
                <button
                  onClick={() => {
                    setDriver2ManualMode(!driver2ManualMode);
                    setDriver2SearchOpen(false);
                    setDriver2SearchText('');
                  }}
                  style={{
                    ...styles.toggleButton,
                    right: 8,
                    top: 8,
                  }}
                >
                  {driver2ManualMode ? '선택' : '수기'}
                </button>
                {driver2SearchOpen && !driver2ManualMode && filteredDriver2Customers.length > 0 && (
                  <div style={styles.dropdown}>
                    {filteredDriver2Customers.slice(0, 5).map((customer) => (
                      <div
                        key={customer.id}
                        onClick={() => handleDriver2Select(customer)}
                        style={styles.dropdownItem}
                      >
                        {customer.name} ({customer.phone})
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div style={styles.grid2}>
              <div style={styles.fieldGroup}>
                <label style={styles.label}>이름</label>
                <input
                  type="text"
                  value={driver2Name}
                  onChange={(e) => setDriver2Name(e.target.value)}
                  style={styles.input}
                />
              </div>
              <div style={styles.fieldGroup}>
                <label style={styles.label}>전화번호</label>
                <input
                  type="text"
                  value={driver2Phone}
                  onChange={(e) => setDriver2Phone(e.target.value)}
                  style={styles.input}
                />
              </div>
            </div>

            <div style={styles.grid2}>
              <div style={styles.fieldGroup}>
                <label style={styles.label}>이메일</label>
                <input
                  type="email"
                  value={driver2Email}
                  onChange={(e) => setDriver2Email(e.target.value)}
                  style={styles.input}
                />
              </div>
              <div style={styles.fieldGroup}>
                <label style={styles.label}>생년월일</label>
                <input
                  type="date"
                  value={driver2Birth}
                  onChange={(e) => setDriver2Birth(e.target.value)}
                  style={styles.input}
                />
              </div>
            </div>

            <div style={styles.fieldGroup}>
              <label style={styles.label}>주소</label>
              <input
                type="text"
                value={driver2Address}
                onChange={(e) => setDriver2Address(e.target.value)}
                style={styles.input}
              />
            </div>

            <div style={styles.grid2}>
              <div style={styles.fieldGroup}>
                <label style={styles.label}>면허번호</label>
                <input
                  type="text"
                  value={driver2LicenseNo}
                  onChange={(e) => setDriver2LicenseNo(e.target.value)}
                  style={styles.input}
                />
              </div>
              <div style={styles.fieldGroup}>
                <label style={styles.label}>면허종류</label>
                <select
                  value={driver2LicenseType}
                  onChange={(e) => setDriver2LicenseType(e.target.value)}
                  style={styles.input}
                >
                  <option>1종보통</option>
                  <option>1종대형</option>
                  <option>2종보통</option>
                  <option>2종소형</option>
                  <option>원동기</option>
                </select>
              </div>
            </div>

            <div style={styles.grid2}>
              <div style={styles.fieldGroup}>
                <label style={styles.label}>면허 발급일</label>
                <input
                  type="date"
                  value={driver2LicenseDate}
                  onChange={(e) => setDriver2LicenseDate(e.target.value)}
                  style={styles.input}
                />
              </div>
              <div style={styles.fieldGroup}>
                <label style={styles.label}>면허 만료일</label>
                <input
                  type="date"
                  value={driver2LicenseExpiry}
                  onChange={(e) => setDriver2LicenseExpiry(e.target.value)}
                  style={styles.input}
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Section 3: Car Info */}
      <div style={styles.card}>
        <div style={styles.sectionTitle}>대차 정보 (차량)</div>

        <div style={styles.fieldGroup}>
          <label style={styles.label}>차량 선택</label>
          <div style={styles.relative}>
            <input
              type="text"
              placeholder={carManualMode ? '수기입력 모드' : '브랜드, 모델, 차량번호로 검색'}
              value={carManualMode ? '' : carSearchText}
              onChange={(e) => setCarSearchText(e.target.value)}
              onFocus={() => !carManualMode && setCarSearchOpen(true)}
              disabled={carManualMode}
              style={{
                ...styles.input,
                opacity: carManualMode ? 0.5 : 1,
              }}
            />
            <button
              onClick={() => {
                setCarManualMode(!carManualMode);
                setCarSearchOpen(false);
                setCarSearchText('');
              }}
              style={{
                ...styles.toggleButton,
                right: 8,
                top: 8,
              }}
            >
              {carManualMode ? '선택' : '수기'}
            </button>
            {carSearchOpen && !carManualMode && filteredCars.length > 0 && (
              <div style={styles.dropdown}>
                {filteredCars.slice(0, 5).map((car) => (
                  <div
                    key={car.id}
                    onClick={() => handleCarSelect(car)}
                    style={styles.dropdownItem}
                  >
                    {car.number} - {car.brand} {car.model}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={styles.grid2}>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>차량 모델</label>
            <input
              type="text"
              value={carModel}
              onChange={(e) => setCarModel(e.target.value)}
              style={styles.input}
            />
          </div>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>차량 번호</label>
            <input
              type="text"
              value={carNumber}
              onChange={(e) => setCarNumber(e.target.value)}
              style={styles.input}
            />
          </div>
        </div>

        <div style={styles.grid2}>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>연료 종류</label>
            <input
              type="text"
              value={carFuelType}
              onChange={(e) => setCarFuelType(e.target.value)}
              style={styles.input}
            />
          </div>
        </div>

        <div style={styles.grid2}>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>인수일시</label>
            <input
              type="datetime-local"
              value={dispatchAt}
              onChange={(e) => setDispatchAt(e.target.value)}
              style={styles.input}
            />
          </div>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>반납일시</label>
            <input
              type="datetime-local"
              value={returnAt}
              onChange={(e) => setReturnAt(e.target.value)}
              style={styles.input}
            />
          </div>
        </div>

        <div style={styles.grid2}>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>인수시 연료</label>
            <input
              type="text"
              placeholder="e.g., 만땅"
              value={dispatchFuel}
              onChange={(e) => setDispatchFuel(e.target.value)}
              style={styles.input}
            />
          </div>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>인수시 주행거리</label>
            <input
              type="number"
              value={dispatchKm}
              onChange={(e) => setDispatchKm(e.target.value)}
              style={styles.input}
            />
          </div>
        </div>
      </div>

      {/* Section 4: Pricing */}
      <div style={styles.card}>
        <div style={styles.sectionTitle}>요금</div>

        <div style={styles.grid2}>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>렌탈 시간</label>
            <input
              type="text"
              value={rentalHours}
              onChange={(e) => setRentalHours(e.target.value)}
              placeholder="자동계산됨"
              style={styles.input}
            />
          </div>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>총액</label>
            <input
              type="text"
              value={formatNumber(totalAmount)}
              onChange={(e) => setTotalAmount(e.target.value.replace(/,/g, ''))}
              style={styles.input}
            />
          </div>
        </div>

        <a href="/quotes/short-term" style={styles.link}>
          단기계산기에서 계산하기 →
        </a>
      </div>

      {/* Section 5: Insurance */}
      <div style={styles.card}>
        <div style={styles.sectionTitle}>보험가입 및 차량손해 면책 제도</div>

        <div style={styles.fieldGroup}>
          <label style={styles.label}>최소 인수 나이</label>
          <input
            type="number"
            value={insMinAge}
            onChange={(e) => setInsMinAge(e.target.value)}
            style={styles.input}
          />
        </div>

        <div style={styles.grid2}>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>자기손해 한도</label>
            <input
              type="text"
              value={formatNumber(insOwnLimit)}
              onChange={(e) => setInsOwnLimit(e.target.value.replace(/,/g, ''))}
              style={styles.input}
            />
          </div>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>자기손해 면책금</label>
            <input
              type="text"
              value={formatNumber(insOwnDeductible)}
              onChange={(e) => setInsOwnDeductible(e.target.value.replace(/,/g, ''))}
              style={styles.input}
            />
          </div>
        </div>

        <div style={styles.grid2}>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>대인 한도</label>
            <input
              type="text"
              value={formatNumber(insPersonLimit)}
              onChange={(e) => setInsPersonLimit(e.target.value.replace(/,/g, ''))}
              style={styles.input}
            />
          </div>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>대인 면책금</label>
            <input
              type="text"
              value={formatNumber(insPersonDeductible)}
              onChange={(e) => setInsPersonDeductible(e.target.value.replace(/,/g, ''))}
              style={styles.input}
            />
          </div>
        </div>

        <div style={styles.grid2}>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>대물 한도</label>
            <input
              type="text"
              value={formatNumber(insPropertyLimit)}
              onChange={(e) => setInsPropertyLimit(e.target.value.replace(/,/g, ''))}
              style={styles.input}
            />
          </div>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>대물 면책금</label>
            <input
              type="text"
              value={formatNumber(insPropertyDeductible)}
              onChange={(e) => setInsPropertyDeductible(e.target.value.replace(/,/g, ''))}
              style={styles.input}
            />
          </div>
        </div>

        <div style={styles.grid2}>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>상해 한도</label>
            <input
              type="text"
              value={formatNumber(insInjuryLimit)}
              onChange={(e) => setInsInjuryLimit(e.target.value.replace(/,/g, ''))}
              style={styles.input}
            />
          </div>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>상해 면책금</label>
            <input
              type="text"
              value={formatNumber(insInjuryDeductible)}
              onChange={(e) => setInsInjuryDeductible(e.target.value.replace(/,/g, ''))}
              style={styles.input}
            />
          </div>
        </div>

        <div style={styles.grid2}>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>사망 한도</label>
            <input
              type="text"
              value={formatNumber(insDeathLimit)}
              onChange={(e) => setInsDeathLimit(e.target.value.replace(/,/g, ''))}
              style={styles.input}
            />
          </div>
        </div>

        <div style={styles.fieldGroup}>
          <label style={styles.label}>보험 메모</label>
          <textarea
            value={insNote}
            onChange={(e) => setInsNote(e.target.value)}
            rows={3}
            style={{ ...styles.input, fontFamily: 'inherit' }}
          />
        </div>
      </div>

      {/* Section 6: Company Info */}
      <div style={styles.card}>
        <div style={styles.sectionTitle}>회사/담당자 정보</div>

        <div style={styles.grid2}>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>회사명</label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              style={styles.input}
            />
          </div>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>대표자</label>
            <input
              type="text"
              value={companyCeo}
              onChange={(e) => setCompanyCeo(e.target.value)}
              style={styles.input}
            />
          </div>
        </div>

        <div style={styles.fieldGroup}>
          <label style={styles.label}>주소</label>
          <input
            type="text"
            value={companyAddress}
            onChange={(e) => setCompanyAddress(e.target.value)}
            style={styles.input}
          />
        </div>

        <div style={styles.grid2}>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>전화번호</label>
            <input
              type="text"
              value={companyPhone}
              onChange={(e) => setCompanyPhone(e.target.value)}
              style={styles.input}
            />
          </div>
        </div>

        <div style={styles.grid2}>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>담당자명</label>
            <input
              type="text"
              value={staffName}
              onChange={(e) => setStaffName(e.target.value)}
              style={styles.input}
            />
          </div>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>담당자 전화</label>
            <input
              type="text"
              value={staffPhone}
              onChange={(e) => setStaffPhone(e.target.value)}
              style={styles.input}
            />
          </div>
        </div>
      </div>

      {/* Section 7: Special Terms */}
      <div style={styles.card}>
        <div style={styles.sectionTitle}>기타 계약사항</div>

        <div style={styles.fieldGroup}>
          <label style={styles.label}>특약사항</label>
          <textarea
            value={specialTerms}
            onChange={(e) => setSpecialTerms(e.target.value)}
            rows={3}
            style={{ ...styles.input, fontFamily: 'inherit' }}
          />
        </div>
      </div>

      {/* Bottom spacer for sticky bar */}
      <div style={{ height: '80px' }} />

      {/* Sticky Bottom Action Bar */}
      <div style={styles.stickyBar}>
        <button
          onClick={() => router.back()}
          style={styles.cancelButton}
          disabled={saving}
        >
          취소
        </button>
        <button
          onClick={() => handleSave(true)}
          style={styles.draftButton}
          disabled={saving}
        >
          {saving ? '저장 중...' : '초안 저장'}
        </button>
        <button
          onClick={() => handleSave(false)}
          style={styles.submitButton}
          disabled={saving}
        >
          {saving ? '저장 중...' : '저장 후 발송'}
        </button>
      </div>
    </div>
    </div>
  );
}

const styles = {
  outerWrap: {
    background: '#f9fafb',
    minHeight: '100vh',
    position: 'relative',
    zIndex: 1,
  } as React.CSSProperties,
  container: {
    maxWidth: '900px',
    margin: '0 auto',
    padding: '24px',
    paddingBottom: '120px',
  } as React.CSSProperties,

  breadcrumb: {
    fontSize: '13px',
    color: '#6b7280',
    marginBottom: '24px',
    fontWeight: '500',
  } as React.CSSProperties,

  card: {
    background: 'white',
    borderRadius: '16px',
    padding: '24px',
    marginBottom: '16px',
    border: '1px solid #e5e7eb',
    position: 'relative',
    zIndex: 2,
  } as React.CSSProperties,

  sectionTitle: {
    fontSize: '16px',
    fontWeight: '800',
    marginBottom: '16px',
    borderLeft: '4px solid #3b82f6',
    paddingLeft: '12px',
    color: '#1f2937',
  } as React.CSSProperties,

  fieldGroup: {
    marginBottom: '16px',
  } as React.CSSProperties,

  label: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#374151',
    marginBottom: '4px',
    display: 'block',
  } as React.CSSProperties,

  input: {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    fontSize: '13px',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  } as React.CSSProperties,

  grid2: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
  } as React.CSSProperties,

  relative: {
    position: 'relative',
  } as React.CSSProperties,

  dropdown: {
    position: 'absolute',
    top: '100%',
    left: '0',
    right: '0',
    background: 'white',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    marginTop: '4px',
    zIndex: '10',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    maxHeight: '200px',
    overflowY: 'auto',
  } as React.CSSProperties,

  dropdownItem: {
    padding: '8px 12px',
    cursor: 'pointer',
    fontSize: '13px',
    borderBottom: '1px solid #f3f4f6',
    transition: 'background-color 0.2s',
  } as React.CSSProperties,

  toggleButton: {
    position: 'absolute',
    padding: '4px 8px',
    background: '#e5e7eb',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  } as React.CSSProperties,

  link: {
    color: '#3b82f6',
    textDecoration: 'none',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
  } as React.CSSProperties,

  stickyBar: {
    position: 'fixed',
    bottom: '0',
    left: '0',
    right: '0',
    background: 'white',
    padding: '12px 24px',
    borderTop: '1px solid #e5e7eb',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
    boxShadow: '0 -2px 8px rgba(0,0,0,0.05)',
  } as React.CSSProperties,

  cancelButton: {
    padding: '8px 16px',
    background: '#f3f4f6',
    color: '#374151',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  } as React.CSSProperties,

  draftButton: {
    padding: '8px 16px',
    background: '#e0e7ff',
    color: '#4f46e5',
    border: '1px solid #c7d2fe',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  } as React.CSSProperties,

  submitButton: {
    padding: '8px 16px',
    background: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  } as React.CSSProperties,
};
