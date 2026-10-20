// src/utils/printTicket.ts

export interface TicketData {
  title: string;
  restaurantName: string;
  orderNumber: string;
  tableNumber?: string;
  serverName?: string;
  date: string;
  time: string;
  items: {
    name: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    notes?: string;
  }[];
  total: number;
  type: 'kitchen' | 'bar' | 'customer' | 'summary';
  notes?: string;
}

export const printTicket = (data: TicketData): Promise<boolean> => {
  return new Promise((resolve) => {
    try {
      // Créer une nouvelle fenêtre
      const printWindow = window.open('', '_blank', 'width=400,height=600,scrollbars=yes');
      
      if (!printWindow) {
        // Si le popup est bloqué, utiliser une iframe
        console.warn('Popup bloqué, utilisation de l\'iframe');
        printWithIframe(data);
        resolve(true);
        return;
      }

      const html = generateTicketHTML(data);
      
      printWindow.document.write(html);
      printWindow.document.close();

      // Attendre que le document soit prêt
      printWindow.onload = () => {
        setTimeout(() => {
          try {
            printWindow.focus();
            printWindow.print();
            
            // Fermer après impression (optionnel)
            setTimeout(() => {
              if (!printWindow.closed) {
                printWindow.close();
              }
            }, 1000);
            
            resolve(true);
          } catch (error) {
            console.error('Erreur impression:', error);
            resolve(false);
          }
        }, 300);
      };

      // Timeout de sécurité
      setTimeout(() => {
        if (!printWindow.closed) {
          resolve(true);
        }
      }, 5000);

    } catch (error) {
      console.error('Erreur création fenêtre:', error);
      printWithIframe(data);
      resolve(true);
    }
  });
};

const printWithIframe = (data: TicketData) => {
  try {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    iframe.style.visibility = 'hidden';
    
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) {
      console.error('Impossible d\'accéder au document de l\'iframe');
      return;
    }

    const html = generateTicketHTML(data);
    iframeDoc.open();
    iframeDoc.write(html);
    iframeDoc.close();

    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        
        // Nettoyer l'iframe après impression
        setTimeout(() => {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
        }, 1000);
      } catch (error) {
        console.error('Erreur impression iframe:', error);
      }
    }, 500);
  } catch (error) {
    console.error('Erreur iframe:', error);
  }
};

const generateTicketHTML = (data: TicketData): string => {
  const isKitchen = data.type === 'kitchen';
  const isBar = data.type === 'bar';
  const isCustomer = data.type === 'customer';
  
  const headerIcon = isKitchen ? '👨‍🍳' : isBar ? '🍹' : isCustomer ? '🧾' : '📋';
  const headerTitle = isKitchen ? 'BON DE CUISINE' : isBar ? 'BON DE BAR' : isCustomer ? 'FACTURE' : 'RÉCAPITULATIF';
  
  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${data.title}</title>
  <style>
    @page {
      size: 80mm auto;
      margin: 0;
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Courier New', monospace;
      font-size: 12px;
      line-height: 1.4;
      width: 80mm;
      margin: 0 auto;
      padding: 8px;
      color: #000;
      background: #fff;
    }
    
    .header {
      text-align: center;
      border-bottom: 2px dashed #000;
      padding-bottom: 8px;
      margin-bottom: 8px;
    }
    
    .restaurant-name {
      font-size: 16px;
      font-weight: bold;
      margin-bottom: 4px;
      text-transform: uppercase;
    }
    
    .ticket-title {
      font-size: 14px;
      font-weight: bold;
      margin: 8px 0;
      padding: 4px;
      background: #000;
      color: #fff;
      text-align: center;
    }
    
    .info-section {
      margin: 8px 0;
      font-size: 11px;
    }
    
    .info-row {
      display: flex;
      justify-content: space-between;
      margin: 3px 0;
      border-bottom: 1px dotted #ccc;
      padding-bottom: 2px;
    }
    
    .info-label {
      font-weight: bold;
    }
    
    .items-section {
      border-top: 1px dashed #000;
      border-bottom: 1px dashed #000;
      padding: 8px 0;
      margin: 8px 0;
    }
    
    .item-row {
      display: flex;
      justify-content: space-between;
      margin: 4px 0;
      padding: 2px 0;
    }
    
    .item-name {
      flex: 1;
      font-weight: bold;
    }
    
    .item-qty {
      width: 40px;
      text-align: center;
      font-weight: bold;
    }
    
    .item-price {
      width: 60px;
      text-align: right;
    }
    
    .item-notes {
      font-size: 10px;
      font-style: italic;
      margin-left: 40px;
      color: #555;
    }
    
    .total-section {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 2px solid #000;
    }
    
    .total-row {
      display: flex;
      justify-content: space-between;
      font-size: 14px;
      font-weight: bold;
      margin: 4px 0;
    }
    
    .footer {
      text-align: center;
      margin-top: 12px;
      padding-top: 8px;
      border-top: 1px dashed #000;
      font-size: 10px;
    }
    
    .urgent-notice {
      background: #000;
      color: #fff;
      padding: 4px;
      text-align: center;
      font-weight: bold;
      margin: 8px 0;
      font-size: 11px;
    }
    
    @media print {
      body {
        width: 80mm;
        padding: 5px;
      }
      
      .no-print {
        display: none;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="restaurant-name">${data.restaurantName}</div>
    <div style="font-size: 10px;">Restaurant & Bar</div>
  </div>
  
  <div class="ticket-title">
    ${headerIcon} ${headerTitle} ${headerIcon}
  </div>
  
  ${isKitchen || isBar ? `
  <div class="urgent-notice">
    ️ À PRÉPARER IMMÉDIATEMENT ⚠️
  </div>
  ` : ''}
  
  <div class="info-section">
    <div class="info-row">
      <span class="info-label">N° Commande:</span>
      <span><strong>${data.orderNumber}</strong></span>
    </div>
    ${data.tableNumber ? `
    <div class="info-row">
      <span class="info-label">Table:</span>
      <span><strong>${data.tableNumber}</strong></span>
    </div>
    ` : ''}
    ${data.serverName ? `
    <div class="info-row">
      <span class="info-label">Serveur:</span>
      <span>${data.serverName}</span>
    </div>
    ` : ''}
    <div class="info-row">
      <span class="info-label">Date:</span>
      <span>${data.date}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Heure:</span>
      <span><strong>${data.time}</strong></span>
    </div>
  </div>
  
  <div class="items-section">
    ${data.items.map(item => `
      <div>
        <div class="item-row">
          <span class="item-qty">${item.quantity}×</span>
          <span class="item-name">${item.name}</span>
          ${!isCustomer ? `<span class="item-price">${item.totalPrice.toLocaleString('fr-FR')} F</span>` : ''}
        </div>
        ${item.notes ? `<div class="item-notes">📝 ${item.notes}</div>` : ''}
      </div>
    `).join('')}
  </div>
  
  ${isCustomer ? `
  <div class="total-section">
    <div class="total-row">
      <span>TOTAL:</span>
      <span>${data.total.toLocaleString('fr-FR')} F</span>
    </div>
  </div>
  ` : ''}
  
  <div class="footer">
    <div> Commande envoyée à ${data.time}</div>
    <div style="margin-top: 4px;">Merci de préparer rapidement !</div>
  </div>
  
  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 300);
    };
  </script>
</body>
</html>
  `;
};

// Fonction pour imprimer plusieurs tickets séquentiellement
export const printMultipleTickets = async (tickets: TicketData[]): Promise<void> => {
  for (let i = 0; i < tickets.length; i++) {
    await printTicket(tickets[i]);
    // Attendre entre les impressions
    if (i < tickets.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
};
