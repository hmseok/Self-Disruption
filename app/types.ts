export interface Car {
  id: number;
  created_at?: string;
  number: string;        // 차량번호
  vin?: string;          // 차대번호
  brand: string;         // 브랜드
  model: string;         // 모델명
  trim?: string;         // 등급
  year?: number;         // 연식
  fuel?: string;         // 연료
  status: 'available' | 'rented' | 'maintenance' | 'sold';
  location?: string;
  mileage?: number;
  image_url?: string;
  purchase_price: number;
  acq_date?: string;
}