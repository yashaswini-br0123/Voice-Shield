import PDFDocument from 'pdfkit';

/**
 * Generates a branded, official PDF report for a scanned audio incident
 * and streams it directly to the Express HTTP response.
 */
export function generateIncidentPDF(incident, res) {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    // Set headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=VoiceShield-Report-${incident.id.slice(0, 8)}.pdf`);

    // Pipe the document straight to Express response
    doc.pipe(res);

    // --- Header ---
    doc.rect(0, 0, 595.28, 90).fill('#0f172a'); // A4 width is 595.28
    
    doc.fillColor('#38bdf8')
       .fontSize(24)
       .font('Helvetica-Bold')
       .text('VOICE SHIELD', 50, 25);
       
    doc.fillColor('#94a3b8')
       .fontSize(10)
       .font('Helvetica')
       .text('AI VOICE IMPERSONATION & DEEPFAKE AUDITING REPORT', 50, 55);

    // --- Incident Status Badge ---
    const isSynthetic = incident.result === 'synthetic';
    const badgeColor = incident.risk_level === 'high' ? '#ef4444' : (incident.risk_level === 'medium' ? '#f59e0b' : '#10b981');
    
    doc.rect(440, 25, 105, 40).fill(badgeColor);
    doc.fillColor('#ffffff')
       .fontSize(11)
       .font('Helvetica-Bold')
       .text(incident.risk_level.toUpperCase() + ' RISK', 440, 39, { width: 105, align: 'center' });

    // --- Main Body ---
    doc.fillColor('#0f172a').fontSize(14).font('Helvetica-Bold').text('Scan Metadata & Details', 50, 120);
    doc.moveTo(50, 138).lineTo(545, 138).stroke('#cbd5e1');

    // Metadata Table Grid
    const gridY = 155;
    const col1 = 50;
    const col2 = 300;
    const rowHeight = 22;

    const data = [
        { label: 'Incident ID:', value: incident.id },
        { label: 'Timestamp:', value: new Date(incident.timestamp).toLocaleString() },
        { label: 'File Name:', value: incident.filename },
        { label: 'Scan Outcome:', value: isSynthetic ? 'SYNTHETIC SPEECH DETECTED (MOCK PREDICTION)' : 'HUMAN SPEECH DETECTED (MOCK PREDICTION)' },
        { label: 'Synthetic Probability:', value: `${(incident.synthetic_probability * 100).toFixed(0)}%` },
        { label: 'Real Speech Probability:', value: `${(incident.real_probability * 100).toFixed(0)}%` },
        { label: 'Classification Confidence:', value: `${(incident.confidence * 100).toFixed(0)}%` },
        { label: 'Model Pipeline Node:', value: `${incident.model_name} (v${incident.model_version})` },
        { label: 'Processing Time:', value: `${incident.processing_time_ms} ms` }
    ];

    doc.font('Helvetica').fontSize(10).fillColor('#334155');
    
    data.forEach((item, index) => {
        const currY = gridY + (index * rowHeight);
        
        // Alternating background rows for readability
        if (index % 2 === 0) {
            doc.rect(50, currY - 4, 495, rowHeight).fill('#f8fafc');
        }
        
        doc.fillColor('#475569').font('Helvetica-Bold').text(item.label, col1 + 8, currY);
        doc.fillColor('#0f172a').font('Helvetica').text(item.value, col2, currY);
    });

    // --- Explanation Section ---
    let nextY = gridY + (data.length * rowHeight) + 25;
    doc.fillColor('#0f172a').fontSize(14).font('Helvetica-Bold').text('Explainable AI Narrative', 50, nextY);
    doc.moveTo(50, nextY + 18).lineTo(545, nextY + 18).stroke('#cbd5e1');
    
    nextY += 30;
    const expText = incident.explanation || 'No explanation generated. Activate Gemini API to get a detailed breakdown.';
    doc.fillColor('#334155').font('Helvetica').fontSize(9.5).text(expText, 50, nextY, {
        width: 495,
        align: 'justify',
        lineGap: 4
    });

    // --- Recommended Actions ---
    nextY = doc.y + 25;
    doc.fillColor('#0f172a').fontSize(14).font('Helvetica-Bold').text('Security Action Checklist', 50, nextY);
    doc.moveTo(50, nextY + 18).lineTo(545, nextY + 18).stroke('#cbd5e1');
    
    nextY += 30;
    const actionText = incident.recommended_action || 'No recommendation specified.';
    doc.fillColor('#334155').font('Helvetica').fontSize(9.5).text(actionText, 50, nextY, {
        width: 495,
        align: 'left',
        lineGap: 4
    });

    // --- Disclaimer Banner at the bottom ---
    doc.rect(50, 710, 495, 55).fill('#f1f5f9');
    doc.rect(50, 710, 4, 55).fill('#475569'); // gray left border
    
    doc.fillColor('#475569')
       .fontSize(8.5)
       .font('Helvetica-Bold')
       .text('CRITICAL SECURITY DISCLAIMER', 65, 718);
       
    doc.font('Helvetica-Oblique')
       .fillColor('#64748b')
       .text('AI voice deepfake detection results are probabilistic in nature and calculated using machine learning patterns. This report should be treated as an advisory tool and not as absolute or legally binding proof of identity or fraud.', 65, 732, { width: 465 });

    // --- Footer page info ---
    doc.fillColor('#94a3b8')
       .font('Helvetica')
       .fontSize(8)
       .text('VoiceShield Security Platform | Technical Evidence Audit Log', 50, 785, { align: 'center' });

    doc.end();
}
