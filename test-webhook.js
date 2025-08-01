const FormData = require('form-data');
const fs = require('fs');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function testLocalWebhook() {
  console.log('🧪 Testing local webhook...');
  
  // Test 1: Without files
  console.log('\n1️⃣ Testing without files:');
  const formData1 = new FormData();
  formData1.append('companyName', 'Teste Company');
  formData1.append('description', 'Teste de envio do webhook sem arquivos');
  formData1.append('impactLevel', 'alto');
  formData1.append('feedbackType', 'bug');
  
  try {
    const response1 = await fetch('http://localhost:5000/api/feedback', {
      method: 'POST',
      body: formData1,
    });
    
    const result1 = await response1.text();
    console.log('✅ Response status:', response1.status);
    console.log('📄 Response body:', result1);
    
  } catch (error) {
    console.error('❌ Test 1 error:', error);
  }

  // Test 2: Health check
  console.log('\n2️⃣ Testing health endpoint:');
  try {
    const healthResponse = await fetch('http://localhost:5000/api/health');
    const healthResult = await healthResponse.json();
    console.log('✅ Health check:', healthResult);
  } catch (error) {
    console.error('❌ Health check error:', error);
  }

  // Test 3: With dummy file (if we can create one)
  console.log('\n3️⃣ Testing with file:');
  try {
    // Create a temporary test file
    const testContent = 'This is a test file for webhook testing';
    const testFilePath = './test-file.txt';
    fs.writeFileSync(testFilePath, testContent);
    
    const formData3 = new FormData();
    formData3.append('companyName', 'Teste Company');
    formData3.append('description', 'Teste de envio do webhook COM arquivos');
    formData3.append('impactLevel', 'medio');
    formData3.append('feedbackType', 'sugestao');
    formData3.append('files', fs.createReadStream(testFilePath), {
      filename: 'test-file.txt',
      contentType: 'text/plain',
    });
    
    const response3 = await fetch('http://localhost:5000/api/feedback', {
      method: 'POST',
      body: formData3,
    });
    
    const result3 = await response3.text();
    console.log('✅ Response status:', response3.status);
    console.log('📄 Response body:', result3);
    
    // Clean up test file
    fs.unlinkSync(testFilePath);
    
  } catch (error) {
    console.error('❌ Test 3 error:', error);
  }
}

testLocalWebhook();
