// js/ui/agentDashboard.js

import { currentUser, availableAgents } from '../state.js';
import { getActiveServiceOrdersForAgent, startServiceOrder } from '../dataController.js';
import { formatDate } from '../utils.js';
import { getAgentName } from './scheduleRenderer.js';
import { displayMessage } from './viewManager.js';

let currentOrderWidget;
let currentOrderContent;

export function initializeAgentDashboard() {
  currentOrderWidget = document.getElementById('agent-current-order-widget');
  if (!currentOrderWidget) return;

  currentOrderContent = document.getElementById('current-order-content');

  currentOrderWidget.addEventListener('click', async (event) => {
    const button = event.target.closest('button');
    if (!button) return;

    if (button.classList.contains('start-service-btn')) {
      const orderId = button.dataset.orderId;
      if (confirm('¿Estás seguro de que quieres iniciar este servicio?')) {
        try {
          const { reportId } = await startServiceOrder(orderId);
          // Avisamos al resto de la app que el servicio ha comenzado
          document.dispatchEvent(new CustomEvent('serviceStarted', { detail: { reportId } }));
        } catch (error) {
          console.error('Error al iniciar el servicio:', error);
          displayMessage(error.message, 'error');
        }
      }
    } else if (button.classList.contains('view-report-btn')) {
      const reportId = button.dataset.reportId;
      document.dispatchEvent(new CustomEvent('viewReport', { detail: { reportId } }));
    }
  });

  // ✅ ESTA LÍNEA ES LA CLAVE DE LA SOLUCIÓN:
  // Cuando un servicio se inicia, se vuelve a llamar a la función que busca y renderiza
  // el widget, actualizándolo al nuevo estado 'in_progress'.
  document.addEventListener('serviceStarted', findAndRenderCurrentOrder);

  // Carga inicial del widget al cargar la página
  findAndRenderCurrentOrder();
}

/**
 * Busca las órdenes activas para el agente actual, prioriza la más relevante y renderiza el widget.
 */
export async function findAndRenderCurrentOrder() {
  const user = currentUser.get();
  if (!user || !user.agentId || !currentOrderWidget) {
    currentOrderWidget.classList.add('hidden');
    return;
  }

  try {
    const activeOrders = await getActiveServiceOrdersForAgent(user.agentId);
    if (activeOrders.length === 0) {
      currentOrderWidget.classList.add('hidden');
      return;
    }

    let orderToDisplay = null;
    const todayString = formatDate(new Date(), 'yyyy-MM-dd');

    orderToDisplay = activeOrders.find((order) => order.status === 'in_progress');
    if (!orderToDisplay) {
      orderToDisplay = activeOrders.find(
        (order) =>
          order.status === 'assigned' &&
          formatDate(new Date(order.service_date), 'yyyy-MM-dd') === todayString
      );
    }
    if (!orderToDisplay) {
      const futureAssignedOrders = activeOrders
        .filter((order) => order.status === 'assigned' && new Date(order.service_date) > new Date())
        .sort((a, b) => new Date(a.service_date) - new Date(b.service_date));
      if (futureAssignedOrders.length > 0) {
        orderToDisplay = futureAssignedOrders[0];
      }
    }

    if (orderToDisplay) {
      renderCurrentOrderWidget(orderToDisplay);
    } else {
      currentOrderWidget.classList.add('hidden');
    }
  } catch (error) {
    console.error('Error buscando la orden activa:', error);
    currentOrderContent.innerHTML =
      '<p class="error-message">No se pudo cargar el servicio actual.</p>';
    currentOrderWidget.classList.remove('hidden');
  }
}

/**
 * Construye el HTML interno del widget con la información de la orden.
 * @param {object} order - El objeto de la orden de servicio.
 */
function renderCurrentOrderWidget(order) {
  if (!order || !currentOrderContent) {
    currentOrderWidget.classList.add('hidden');
    return;
  }

  const serviceDate = new Date(order.service_date);
  let isServiceToday = false;
  if (serviceDate) {
    const today = new Date();
    isServiceToday =
      today.getFullYear() === serviceDate.getFullYear() &&
      today.getMonth() === serviceDate.getMonth() &&
      today.getDate() === serviceDate.getDate();
  }

  const disabledAttribute = isServiceToday ? '' : 'disabled';
  const buttonTitle = isServiceToday
    ? 'Iniciar el parte de servicio'
    : 'Solo se puede iniciar el servicio en la fecha programada';

  const assignedAgentsNames = (order.assigned_agents || [])
    .map((id) => getAgentName(id))
    .join(', ');
  const managerName = order.shift_manager_id ? getAgentName(order.shift_manager_id) : 'No asignado';

  let buttonHtml = '';
  if (order.status === 'assigned') {
    buttonHtml = `<button class="button button-primary start-service-btn" data-order-id="${order.id}" ${disabledAttribute} title="${buttonTitle}">
                        <span class="material-icons">play_circle_outline</span> Iniciar Servicio
                      </button>`;
  } else if (order.status === 'in_progress' && order.reportId) {
    buttonHtml = `<button class="button button-primary view-report-btn" data-report-id="${order.reportId}">
                        <span class="material-icons">visibility</span> Ver Parte de Servicio
                      </button>`;
  }

  currentOrderContent.innerHTML = `
        <div class="widget-header">
            <h4>Mi Servicio Actual</h4>
            <span class="widget-reg-number">${order.order_reg_number || 'Sin Reg.'}</span>
        </div>
        <div class="widget-details">
            <p><strong>Orden:</strong> ${order.title}</p>
            <p><strong>Fecha:</strong> ${formatDate(serviceDate, 'dd/MM/yyyy')}</p>
            <p><strong>Responsable:</strong> ${managerName}</p>
            <p><strong>Agentes:</strong> ${assignedAgentsNames || 'Ninguno'}</p>
        </div>
        <div class="widget-actions">
            ${buttonHtml}
        </div>
    `;

  currentOrderWidget.classList.remove('hidden');
}
