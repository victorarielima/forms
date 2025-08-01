const FormData = require('form-data');
const fs = require('fs');
const fetch = require('node-fetch');

async function testLocalWebhook() {
  console.log('Testing local webhook...');
  
  const formData = new FormData();
  formData.append('companyName', 'Teste Company');
  formData.append('description', 'Teste de envio do webhook');
  formData.append('impactLevel', 'alto');
  formData.append('feedbackType', 'bug');
  
  try {
    const response = await fetch('http://localhost:5000/api/feedback', {
      method: 'POST',
      body: formData,
      headers: formData.getHeaders(),
    });
    
    const result = await response.text();
    console.log('Response status:', response.status);
    console.log('Response body:', result);
    
  } catch (error) {
    console.error('Test error:', error);
  }
}

testLocalWebhook();
