module.exports=async function(context){
  const {checkBundle}=await import('./check-desktop-bundle.js');
  const archNames={0:'ia32',1:'x64',2:'armv7l',3:'arm64',4:'universal'};
  await checkBundle({platform:context.electronPlatformName,arch:archNames[context.arch]});
};
