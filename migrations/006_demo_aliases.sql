UPDATE users SET name=CASE id
  WHEN 'eo' THEN 'นาย A • เจ้าหน้าที่สิ่งแวดล้อม'
  WHEN 'es1' THEN 'นาย B • หัวหน้างาน'
  WHEN 'es2' THEN 'นาย C • ผู้ตรวจสอบอิสระ'
  WHEN 'owner' THEN 'นาย D • ผู้รับผิดชอบผลิต'
  WHEN 'manager' THEN 'นาย E • ผู้บริหาร'
  WHEN 'admin' THEN 'นาย F • ผู้ดูแลระบบ'
  WHEN 'auditor' THEN 'นาย G • ผู้ตรวจประเมิน'
  WHEN 'eo-b' THEN 'นาย H • เจ้าหน้าที่ Site B'
  ELSE name END WHERE demo=true AND organization_id='demo-org';
