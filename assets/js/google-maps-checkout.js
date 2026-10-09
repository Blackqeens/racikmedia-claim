(function (global) {
  'use strict';

  var map;
  var marker;
  var geocoder;
  var addressInput;
  var statusElement;
  var latitudeInput;
  var longitudeInput;

  function setStatus(message, isError) {
    statusElement.textContent = message;
    statusElement.className = 'mt-2 text-xs ' + (isError ? 'text-rose-700' : 'text-slate-600');
  }

  function setMapMessage(message) {
    var mapElement = document.getElementById('checkoutMap');
    mapElement.replaceChildren(document.createTextNode(message));
    mapElement.classList.add('p-4');
  }

  function coordinateValue(position, key) {
    return typeof position[key] === 'function' ? position[key]() : position[key];
  }

  function setMarkerPosition(position, formattedAddress) {
    marker.setPosition(position);
    marker.setVisible(true);
    map.panTo(position);
    latitudeInput.value = Number(coordinateValue(position, 'lat')).toFixed(6);
    longitudeInput.value = Number(coordinateValue(position, 'lng')).toFixed(6);
    if (formattedAddress) addressInput.value = formattedAddress;
    setStatus(
      (formattedAddress ? formattedAddress + ' · ' : 'Pin dipilih · ')
        + latitudeInput.value + ', ' + longitudeInput.value,
      false
    );
  }

  function reverseGeocode(position) {
    setStatus('Memeriksa alamat titik yang dipilih…', false);
    geocoder.geocode({ location: position }, function (results, status) {
      if (status !== 'OK') {
        setMarkerPosition(position);
        setStatus(
          'Koordinat tersimpan, tetapi alamat tidak dapat ditemukan (' + status + '). Periksa alamat secara manual.',
          true
        );
        return;
      }
      var address = results && results[0] ? results[0].formatted_address : '';
      setMarkerPosition(position, address);
    });
  }

  function searchAddress() {
    var address = document.getElementById('mapAddressSearch').value.trim()
      || addressInput.value.trim();
    if (!address) {
      setStatus('Masukkan alamat untuk dicari di peta.', true);
      return;
    }
    setStatus('Mencari alamat…', false);
    geocoder.geocode({ address: address, region: 'id' }, function (results, status) {
      if (status !== 'OK' || !results || !results[0] || !results[0].geometry) {
        setStatus('Alamat tidak ditemukan atau layanan pencarian gagal (' + status + ').', true);
        return;
      }
      setMarkerPosition(results[0].geometry.location, results[0].formatted_address);
      map.setZoom(16);
    });
  }

  function useCurrentLocation() {
    if (!global.navigator.geolocation) {
      setStatus('Browser ini tidak menyediakan layanan lokasi.', true);
      return;
    }
    setStatus('Meminta izin lokasi dari browser…', false);
    global.navigator.geolocation.getCurrentPosition(
      function (result) {
        reverseGeocode({
          lat: result.coords.latitude,
          lng: result.coords.longitude
        });
        map.setZoom(16);
      },
      function (error) {
        var message = error.code === error.PERMISSION_DENIED
          ? 'Izin lokasi ditolak. Anda tetap dapat mencari alamat atau memilih pin di peta.'
          : 'Lokasi tidak dapat diperoleh. Coba cari alamat atau pilih pin di peta.';
        setStatus(message, true);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  function initMap() {
    var mapElement = document.getElementById('checkoutMap');
    mapElement.replaceChildren();
    mapElement.classList.remove('p-4');

    var fallbackCenter = { lat: -6.200000, lng: 106.816666 };
    map = new global.google.maps.Map(mapElement, {
      center: fallbackCenter,
      zoom: 5,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true
    });
    geocoder = new global.google.maps.Geocoder();
    marker = new global.google.maps.Marker({
      map: map,
      position: fallbackCenter,
      draggable: true,
      title: 'Titik pengiriman'
    });
    marker.setVisible(false);

    map.addListener('click', function (event) {
      reverseGeocode(event.latLng);
    });
    marker.addListener('dragend', function (event) {
      reverseGeocode(event.latLng);
    });

    var existingAddress = addressInput.value.trim();
    if (existingAddress) {
      geocoder.geocode({ address: existingAddress, region: 'id' }, function (results, status) {
        if (status === 'OK' && results && results[0] && results[0].geometry) {
          marker.setVisible(true);
          setMarkerPosition(results[0].geometry.location, null);
          map.setZoom(15);
        } else {
          setStatus('Alamat belum dipetakan. Cari alamat atau klik peta untuk memilih pin.', false);
        }
      });
    }
  }

  function mapsAuthFailure() {
    setMapMessage('Google Maps menolak API key. Periksa pembatasan domain, API yang diaktifkan, dan billing project.');
    setStatus('Peta tidak dapat dimuat. Alamat tetap dapat diisi secara manual.', true);
  }

  function loadGoogleMaps() {
    var config = global.GOOGLE_MAPS_CONFIG;
    var key = config && typeof config.apiKey === 'string' ? config.apiKey.trim() : '';
    if (!key) {
      setMapMessage('Google Maps belum dikonfigurasi. Isi API key yang sudah dibatasi domain pada assets/js/google-maps-config.js.');
      setStatus('Peta tidak tersedia. Alamat tetap dapat diisi secara manual.', true);
      return;
    }

    global.initRacikCheckoutMap = initMap;
    global.gm_authFailure = mapsAuthFailure;
    var script = document.createElement('script');
    script.src = 'https://maps.googleapis.com/maps/api/js?key='
      + encodeURIComponent(key)
      + '&callback=initRacikCheckoutMap&v=weekly';
    script.async = true;
    script.onerror = function () {
      setMapMessage('Google Maps gagal dimuat. Periksa koneksi internet dan konfigurasi API key.');
      setStatus('Peta tidak dapat dimuat. Alamat tetap dapat diisi secara manual.', true);
    };
    document.head.appendChild(script);
  }

  function initializeCheckoutMap() {
    var mapElement = document.getElementById('checkoutMap');
    if (!mapElement) return;
    addressInput = document.getElementById('deliveryAddress');
    statusElement = document.getElementById('mapLocationStatus');
    latitudeInput = document.getElementById('deliveryLatitude');
    longitudeInput = document.getElementById('deliveryLongitude');

    document.getElementById('searchMapAddress').addEventListener('click', searchAddress);
    document.getElementById('mapAddressSearch').addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        searchAddress();
      }
    });
    document.getElementById('useCurrentLocation').addEventListener('click', useCurrentLocation);
    loadGoogleMaps();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeCheckoutMap, { once: true });
  } else {
    initializeCheckoutMap();
  }
})(window);
