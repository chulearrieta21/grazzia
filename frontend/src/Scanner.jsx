import React, { useEffect, useState } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { Camera, CheckCircle, AlertTriangle, User, FileText, Loader2 } from 'lucide-react';
import axios from 'axios';

const Scanner = () => {
  const [operatorId, setOperatorId] = useState(null);
  const [orderId, setOrderId] = useState(null);
  const [status, setStatus] = useState('SCAN_OPERATOR'); // SCAN_OPERATOR, CHECKING_OPERATOR, SCAN_ORDER, CONFIRMING, SUCCESS, ERROR
  const [message, setMessage] = useState('');
  const [earnings, setEarnings] = useState(0);

  useEffect(() => {
    let scanner;
    if (status === 'SCAN_OPERATOR' || status === 'SCAN_ORDER') {
      scanner = new Html5QrcodeScanner(
        "reader",
        { fps: 10, qrbox: {width: 250, height: 250} },
        /* verbose= */ false
      );
      scanner.render(onScanSuccess, onScanFailure);
    }

    return () => {
      if (scanner) {
        scanner.clear().catch(error => console.error("Failed to clear scanner", error));
      }
    };
  }, [status]);

  const onScanSuccess = async (decodedText, decodedResult) => {
    if (status === 'SCAN_OPERATOR') {
      if (decodedText.startsWith('EMP-')) {
        setStatus('CHECKING_OPERATOR'); // Pause scanning
        try {
          const res = await axios.post('http://127.0.0.1:8000/api/v1/qr/escanear', { qr_operario: decodedText });
          
          if (res.data.tipo_pago === 'por_produccion') {
            setOperatorId(decodedText);
            setStatus('SCAN_ORDER');
          } else if (res.data.tipo_pago === 'por_dia') {
            setOperatorId(decodedText);
            setEarnings(res.data.salario_dia);
            setMessage(res.data.mensaje);
            setStatus('SUCCESS');
          }
        } catch (error) {
          setMessage(error.response?.data?.detail || 'Error al verificar operario');
          setStatus('ERROR');
        }
      } else {
        setMessage('QR de operario inválido. Debe empezar con EMP-');
        setTimeout(() => setMessage(''), 3000);
      }
    } else if (status === 'SCAN_ORDER') {
      if (decodedText.startsWith('OP-')) {
        setOrderId(decodedText);
        handleConfirm(decodedText);
      } else {
        setMessage('QR de orden inválido. Debe empezar con OP-');
        setTimeout(() => setMessage(''), 3000);
      }
    }
  };

  const onScanFailure = (error) => {
    // ignore
  };

  const handleConfirm = async (scannedOrderId) => {
    setStatus('CONFIRMING');
    try {
      const response = await axios.post('http://localhost:8000/api/v1/produccion/registrar', {
        qr_operario: operatorId,
        qr_orden: scannedOrderId
      });
      
      setEarnings(response.data.valor_ganado);
      setMessage(`${response.data.proceso} registrado por ${response.data.operario} en la orden ${response.data.referencia}`);
      setStatus('SUCCESS');
    } catch (error) {
      setMessage(error.response?.data?.detail || 'Error de conexión con el servidor');
      setStatus('ERROR');
    }
  };

  const resetScanner = () => {
    setOperatorId(null);
    setOrderId(null);
    setStatus('SCAN_OPERATOR');
    setMessage('');
    setEarnings(0);
  };

  const resetOrder = () => {
    setOrderId(null);
    setStatus('SCAN_ORDER');
    setMessage('');
    setEarnings(0);
  };

  return (
    <div className="min-h-screen flex flex-col items-center p-6 justify-center max-w-md mx-auto">
      <div className="w-full text-center mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Calzado GRAZZIA</h1>
        <p className="text-gray-400">Control de Producción</p>
      </div>

      <div className="w-full glass-panel p-6 flex flex-col items-center">
        {/* Progress Indicator */}
        <div className="flex w-full items-center justify-between mb-6 text-sm">
          <div className={`flex flex-col items-center ${operatorId ? 'text-grazzia-accent' : 'text-grazzia'}`}>
            <User className="mb-1 h-6 w-6" />
            <span>Operario</span>
          </div>
          <div className={`h-px w-16 ${operatorId ? 'bg-grazzia-accent' : 'bg-gray-700'}`}></div>
          <div className={`flex flex-col items-center ${orderId ? 'text-grazzia-accent' : (status === 'SCAN_ORDER' ? 'text-grazzia' : 'text-gray-500')}`}>
            <FileText className="mb-1 h-6 w-6" />
            <span>Orden</span>
          </div>
        </div>

        {/* Scanner Area */}
        {(status === 'SCAN_OPERATOR' || status === 'SCAN_ORDER') && (
          <div className="w-full flex flex-col items-center">
            <h2 className="text-xl font-semibold mb-4 text-center">
              {status === 'SCAN_OPERATOR' ? 'Escanea tu Carnet (QR)' : 'Escanea la Hoja de Ruta (QR)'}
            </h2>
            <div id="reader" className="w-full overflow-hidden rounded-xl border-2 border-dashed border-gray-600 bg-gray-900/50"></div>
            {message && (
              <p className="mt-4 text-red-400 text-sm font-medium text-center">{message}</p>
            )}
          </div>
        )}

        {/* Status Messages */}
        {status === 'CONFIRMING' && (
          <div className="py-12 flex flex-col items-center text-center">
            <Loader2 className="h-12 w-12 animate-spin text-grazzia mb-4" />
            <h2 className="text-xl font-semibold">Validando registro...</h2>
            <p className="text-gray-400 mt-2">Verificando tarifas y restricciones</p>
          </div>
        )}

        {status === 'CHECKING_OPERATOR' && (
          <div className="py-12 flex flex-col items-center text-center">
            <Loader2 className="h-12 w-12 animate-spin text-grazzia mb-4" />
            <h2 className="text-xl font-semibold">Verificando Operario...</h2>
          </div>
        )}

        {status === 'SUCCESS' && (
          <div className="py-8 flex flex-col items-center text-center">
            <CheckCircle className="h-16 w-16 text-grazzia-accent mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">¡Registro Exitoso!</h2>
            <p className="text-gray-300 mb-6">{message}</p>
            {earnings > 0 && (
              <div className="bg-grazzia-accent/20 border border-grazzia-accent/30 rounded-xl p-4 w-full mb-6">
                <p className="text-sm text-grazzia-accent uppercase font-bold mb-1">Valor</p>
                <p className="text-3xl font-bold text-white">${earnings.toLocaleString()}</p>
              </div>
            )}
            <div className="flex gap-4 w-full">
              {orderId && (
                <button onClick={resetOrder} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-semibold py-3 px-4 rounded-xl transition-colors">
                  Otra Orden
                </button>
              )}
              <button onClick={resetScanner} className="flex-1 bg-grazzia hover:bg-grazzia-dark text-white font-semibold py-3 px-4 rounded-xl transition-colors">
                Finalizar (Siguiente Operario)
              </button>
            </div>
          </div>
        )}

        {status === 'ERROR' && (
          <div className="py-8 flex flex-col items-center text-center">
            <AlertTriangle className="h-16 w-16 text-red-500 mb-4" />
            <h2 className="text-2xl font-bold text-red-500 mb-2">Registro Bloqueado</h2>
            <p className="text-gray-300 mb-6 bg-red-500/10 border border-red-500/20 p-4 rounded-xl">
              {message}
            </p>
            <button onClick={resetOrder} className="w-full bg-gray-700 hover:bg-gray-600 text-white font-semibold py-3 px-4 rounded-xl transition-colors">
              Intentar de Nuevo
            </button>
          </div>
        )}
      </div>
      
      {/* Operator Status Indicator */}
      {operatorId && status !== 'SCAN_OPERATOR' && (
        <div className="mt-6 flex items-center justify-between w-full glass-panel px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="bg-grazzia-accent/20 p-2 rounded-full">
              <User className="h-5 w-5 text-grazzia-accent" />
            </div>
            <div className="text-left">
              <p className="text-xs text-gray-400">Operario Activo</p>
              <p className="font-medium text-sm truncate w-32">{operatorId}</p>
            </div>
          </div>
          <button onClick={resetScanner} className="text-xs text-grazzia hover:text-white transition-colors underline">
            Cerrar Sesión
          </button>
        </div>
      )}
    </div>
  );
};

export default Scanner;
