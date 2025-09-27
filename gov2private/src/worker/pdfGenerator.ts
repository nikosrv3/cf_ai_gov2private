// PDF generation for resume export
// TODO: maybe add support for different templates later

import type { RunData } from '../types/run';

export async function generateResumePDF(runData: RunData): Promise<Uint8Array> {
  const { PDFDocument, rgb } = await import('pdf-lib');
  
  // Create a new PDF document
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4 size in points
  
  const { width, height } = page.getSize();
  const margin = 50; // 50 point margins
  const contentWidth = width - (margin * 2);
  
  let yPosition = height - margin;
  const lineHeight = 14;
  const sectionSpacing = 20;
  
  // Load fonts - using Helvetica for professional look
  const helveticaFont = await pdfDoc.embedFont('Helvetica');
  const helveticaBoldFont = await pdfDoc.embedFont('Helvetica-Bold');
  
  // Helper function to add text with word wrapping
  // This handles long text by breaking it into multiple lines
  const addText = async (text: string, fontSize: number, isBold: boolean = false, color: [number, number, number] = [0, 0, 0]) => {
    const words = text.split(' ');
    let line = '';
    let currentY = yPosition;
    const font = isBold ? helveticaBoldFont : helveticaFont;
    
    for (const word of words) {
      const testLine = line + (line ? ' ' : '') + word;
      const textWidth = font.widthOfTextAtSize(testLine, fontSize);
      
      if (textWidth > contentWidth && line) {
        page.drawText(line, {
          x: margin,
          y: currentY,
          size: fontSize,
          color: rgb(color[0], color[1], color[2]),
          font: font,
        });
        line = word;
        currentY -= lineHeight;
      } else {
        line = testLine;
      }
    }
    
    if (line) {
      page.drawText(line, {
        x: margin,
        y: currentY,
        size: fontSize,
        color: rgb(color[0], color[1], color[2]),
        font: font,
      });
    }
    
    yPosition = currentY - lineHeight;
  };
  
  // Helper function to add section title
  const addSectionTitle = async (title: string) => {
    yPosition -= sectionSpacing;
    await addText(title, 14, true, [0.15, 0.39, 0.69]); // Blue color
    yPosition -= 5;
  };
  
  const data = runData.phases?.normalize;
  if (!data) {
    throw new Error('No resume data available');
  }
  
  // Header
  if (data.name) {
    await addText(data.name, 20, true, [0.12, 0.25, 0.69]);
    yPosition -= 10;
  }
  
  // Contact information
  const contactInfo = [
    data.contact.email,
    data.contact.phone,
    data.contact.location,
    ...data.contact.links
  ].filter(Boolean).join(' | ');
  
  if (contactInfo) {
    await addText(contactInfo, 10, false, [0.42, 0.45, 0.5]);
    yPosition -= 15;
  }
  
  // Professional Summary
  if (data.summary) {
    await addSectionTitle('Professional Summary');
    await addText(data.summary, 11);
    yPosition -= 5;
  }
  
  // Skills
  if (data.skills && data.skills.length > 0) {
    await addSectionTitle('Core Competencies');
    const skillsText = data.skills.join(' • ');
    await addText(skillsText, 10);
    yPosition -= 5;
  }
  
  // Experience
  if (data.experience && data.experience.length > 0) {
    await addSectionTitle('Professional Experience');
    
    for (const job of data.experience) {
      // Job title and company
      let jobHeader = `${job.title} | ${job.org}`;
      if (job.location) {
        jobHeader += ` | ${job.location}`;
      }
      await addText(jobHeader, 12, true);
      
      // Duration
      if (job.start || job.end) {
        const duration = `${job.start || ''} - ${job.end || 'Present'}`;
        await addText(duration, 10, false, [0.42, 0.45, 0.5]);
      }
      
      // Bullets
      if (job.bullets && job.bullets.length > 0) {
        for (const bullet of job.bullets) {
          await addText(`• ${bullet}`, 10);
        }
      }
      
      yPosition -= 10;
    }
  }
  
  // Education
  if (data.education && data.education.length > 0) {
    await addSectionTitle('Education');
    
    for (const edu of data.education) {
      const educationText = `${edu.degree}${edu.field ? ` in ${edu.field}` : ''} | ${edu.institution}${edu.year ? ` | ${edu.year}` : ''}`;
      await addText(educationText, 11, true);
      yPosition -= 5;
    }
  }
  
  // Certifications
  if (data.certifications && data.certifications.length > 0) {
    await addSectionTitle('Certifications');
    const certsText = data.certifications.join(' • ');
    await addText(certsText, 10);
  }
  
  
  // Serialize the PDF
  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}

