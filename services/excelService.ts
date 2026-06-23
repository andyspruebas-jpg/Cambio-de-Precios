import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { getExcelFormat, getExcelPctFormat } from '../utils/formatters';

export interface ExcelRow {
    barcode: string;
    description: string;
    provider: string;
    oldCost: number;
    newCost: number;
    costMargin: number;
    oldPrice: number;
    newPrice: number;
    priceMargin: number;
    timestamp: string;
}

export type ExcelType = 'full' | 'cost' | 'price' | 'sala_daily';

export const downloadExcel = async (data: ExcelRow[], type: ExcelType, fileName?: string) => {
    if (data.length === 0) {
        alert('No hay datos para descargar');
        return;
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Cambios de Precios');

    // Define columns based on type
    if (type === 'full') {
        worksheet.columns = [
            { header: 'Código de Barras', key: 'barcode', width: 18 },
            { header: 'Producto', key: 'description', width: 40 },
            { header: 'Proveedor', key: 'provider', width: 28 },
            { header: 'Costo Antiguo', key: 'oldCost', width: 14 },
            { header: 'Costo Nuevo', key: 'newCost', width: 14 },
            { header: 'Margen Costo (%)', key: 'costMargin', width: 16 },
            { header: 'Precio Antiguo', key: 'oldPrice', width: 14 },
            { header: 'Precio Nuevo', key: 'newPrice', width: 14 },
            { header: 'Margen Precio (%)', key: 'priceMargin', width: 16 },
            { header: 'Fecha/Hora', key: 'timestamp', width: 22 }
        ];
    } else if (type === 'cost') {
        worksheet.columns = [
            { header: 'Código de Barras', key: 'barcode', width: 18 },
            { header: 'Producto', key: 'description', width: 46 },
            { header: 'Costo Antiguo', key: 'oldCost', width: 16 },
            { header: 'Costo Nuevo', key: 'newCost', width: 16 },
        ];
    } else if (type === 'price') {
        worksheet.columns = [
            { header: 'Código de Barras', key: 'barcode', width: 18 },
            { header: 'Producto', key: 'description', width: 46 },
            { header: 'Precio Antiguo', key: 'oldPrice', width: 16 },
            { header: 'Precio Nuevo', key: 'newPrice', width: 16 },
        ];
    } else if (type === 'sala_daily') {
        worksheet.columns = [
            { header: 'Producto', key: 'description', width: 50 },
            { header: 'Precio Antiguo', key: 'oldPrice', width: 18 },
            { header: 'Precio Nuevo', key: 'newPrice', width: 18 },
            { header: 'Fecha/Hora', key: 'timestamp', width: 22 }
        ];
    } else {
        worksheet.columns = [
            { header: 'Código de Barras', key: 'barcode', width: 25 },
            { header: 'Precio Nuevo', key: 'newPrice', width: 15 }
        ];
    }

    // Style header
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' }
    };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.getRow(1).height = 25;

    // Add data rows
    data.forEach((row, index) => {
        let rowData: any = {
            barcode: row.barcode,
            description: row.description,
            provider: row.provider,
            timestamp: new Date(row.timestamp).toLocaleString('es-BO')
        };

        if (type === 'full') {
            rowData = {
                ...rowData,
                oldCost: row.oldCost,
                newCost: row.newCost,
                costMargin: row.costMargin,
                oldPrice: row.oldPrice,
                newPrice: row.newPrice,
                priceMargin: row.priceMargin
            };
        } else if (type === 'cost') {
            rowData = {
                barcode: row.barcode,
                description: row.description,
                oldCost: row.oldCost,
                newCost: row.newCost
            };
        } else if (type === 'price') {
            rowData = {
                barcode: row.barcode,
                description: row.description,
                oldPrice: row.oldPrice,
                newPrice: row.newPrice
            };
        } else if (type === 'sala_daily') {
            rowData = {
                description: row.description,
                oldPrice: row.oldPrice,
                newPrice: row.newPrice,
                timestamp: rowData.timestamp
            };
        } else {
            rowData = {
                barcode: row.barcode,
                newPrice: row.newPrice
            };
        }

        const excelRow = worksheet.addRow(rowData);

        // Alternating colors
        const fillColor = index % 2 === 0 ? 'FFD9E1F2' : 'FFFFFFFF';
        excelRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: fillColor }
        };

        // Borders
        excelRow.eachCell({ includeEmpty: true }, (cell) => {
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFB4C7E7' } },
                left: { style: 'thin', color: { argb: 'FFB4C7E7' } },
                bottom: { style: 'thin', color: { argb: 'FFB4C7E7' } },
                right: { style: 'thin', color: { argb: 'FFB4C7E7' } }
            };
            cell.alignment = { vertical: 'middle' };
        });

        // Format numbers based on type
        if (type === 'full') {
            excelRow.getCell(4).numFmt = getExcelFormat(row.provider); // Old Cost
            excelRow.getCell(5).numFmt = getExcelFormat(row.provider); // New Cost
            excelRow.getCell(6).numFmt = getExcelPctFormat(row.provider);      // Cost Margin
            excelRow.getCell(7).numFmt = getExcelFormat(row.provider); // Old Price
            excelRow.getCell(8).numFmt = getExcelFormat(row.provider); // New Price
            excelRow.getCell(9).numFmt = getExcelPctFormat(row.provider);      // Price Margin
        } else if (type === 'cost') {
            excelRow.getCell(3).numFmt = getExcelFormat(row.provider);
            excelRow.getCell(4).numFmt = getExcelFormat(row.provider);
        } else if (type === 'price') {
            excelRow.getCell(3).numFmt = getExcelFormat(row.provider);
            excelRow.getCell(4).numFmt = getExcelFormat(row.provider);
        } else if (type === 'sala_daily') {
            excelRow.getCell(2).numFmt = getExcelFormat(row.provider); // Old Price
            excelRow.getCell(3).numFmt = getExcelFormat(row.provider); // New Price
        } else {
            excelRow.getCell(2).numFmt = '0.00'; // Clean decimal format for price
        }
    });

    // Autofilter
    worksheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: worksheet.columns.length }
    };

    // Generate file
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    const typeNames = {
        full: 'costo_y_precio',
        cost: 'solo_costos',
        price: 'solo_precios',
        sala_daily: 'reporte_diario_sala'
    };

    // Use custom fileName if provided, otherwise default to type logic
    const finalName = fileName
        ? (fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`)
        : `${typeNames[type]}_${new Date().toISOString().split('T')[0]}.xlsx`;

    saveAs(blob, finalName);
};
