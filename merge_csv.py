import csv
import os

fact_csv_path = '/Users/sibtainahmedqureshi/Downloads/csv/FACT_QUALITY_MATERIAL_MOVEMENT_202606301725.csv'
plant_master_csv_path = '/Users/sibtainahmedqureshi/Downloads/Plant Master in SAP.XLSX - Sheet1.csv'
output_csv_path = '/Users/sibtainahmedqureshi/Downloads/csv/merged_dashboard_data.csv'

# Columns we want from FACT
fact_cols_to_keep = [
    'POSTING_DATE_KEY',
    'MOVEMENT_TYPE',
    'QUANTITY',
    'SENDER_PLANT_KEY',
    'RECEIVING_PLANT_KEY',
    'MATERIAL_KEY',
    'UNIT_OF_ENTRY',
    'AMOUNT_IN_LC',
    'USERNAME'
]

# Create a dictionary for Plant Master
plant_data = {}
with open(plant_master_csv_path, mode='r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        werks = row.get('WERKS', '').strip()
        if werks:
            plant_data[werks] = {
                'NAME1': row.get('NAME1', ''),
                'ORT01': row.get('ORT01', '')
            }

allowed_movement_types = {'101', '102', '261', '262'}

rows_written = 0

with open(fact_csv_path, mode='r', encoding='utf-8') as fact_f, \
     open(output_csv_path, mode='w', encoding='utf-8', newline='') as out_f:
    
    reader = csv.DictReader(fact_f)
    
    # Check if all fact cols exist, if not, only keep the ones that exist
    fact_cols_present = [col for col in fact_cols_to_keep if col in reader.fieldnames]
    
    # Define output fields
    out_fields = fact_cols_present + ['SENDER_PLANT_NAME', 'SENDER_PLANT_CITY']
    
    writer = csv.DictWriter(out_f, fieldnames=out_fields)
    writer.writeheader()
    
    for row in reader:
        mov_type = row.get('MOVEMENT_TYPE', '').strip()
        if mov_type in allowed_movement_types:
            sender_plant = row.get('SENDER_PLANT_KEY', '').strip()
            
            # Extract only the needed columns
            out_row = {k: row[k] for k in fact_cols_present}
            
            # Add Plant info
            p_data = plant_data.get(sender_plant, {})
            out_row['SENDER_PLANT_NAME'] = p_data.get('NAME1', '')
            out_row['SENDER_PLANT_CITY'] = p_data.get('ORT01', '')
            
            writer.writerow(out_row)
            rows_written += 1

print(f"Successfully processed without pandas. Saved {rows_written} rows to: {output_csv_path}")
