import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function checkMilestonesTable() {
  try {
    // Get table structure
    const { data: columns, error } = await supabase
      .from('milestones')
      .select('*')
      .limit(0);
    
    if (error) {
      console.error('Error checking milestones table:', error);
      return;
    }

    // Get column information from information_schema
    const { data: columnsInfo, error: columnsError } = await supabase.rpc('get_table_columns', {
      table_name: 'milestones'
    });

    if (columnsError) {
      // If the RPC doesn't exist, try a direct query
      const { data: testData, error: testError } = await supabase
        .from('milestones')
        .select('*')
        .limit(1);
      
      if (testError) {
        console.error('Error fetching test data:', testError);
      } else {
        console.log('\nMilestones table test row (to see columns):');
        console.log(testData);
        if (testData && testData.length > 0) {
          console.log('\nColumns found:');
          console.log(Object.keys(testData[0]));
        }
      }
    } else {
      console.log('Milestones table columns:', columnsInfo);
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

checkMilestonesTable();
